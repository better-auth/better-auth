import type { BetterAuthPlugin, Status } from "better-auth";
import { BetterAuthError } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { statusCodes } from "better-call";
import type { SCIMOptions } from "./configuration";
import {
	areValidSCIMScopes,
	createSCIMConnectionMiddleware,
	isValidSCIMCredentialId,
} from "./connection-authentication";
import { createDecommissionSCIMConnectionEndpoint } from "./connection-decommission";
import {
	getSCIMResourceType,
	getSCIMResourceTypes,
	getSCIMSchema,
	getSCIMSchemas,
	getSCIMServiceProviderConfig,
} from "./discovery";
import {
	createSCIMGroup,
	deleteSCIMGroup,
	getSCIMGroup,
	listSCIMGroups,
	patchSCIMGroup,
	replaceSCIMGroup,
} from "./group-provisioning";
import { createSCIMIdentityCoordinator } from "./identity";
import {
	createReconcileSCIMProjectionEndpoint,
	createSCIMProjectionCoordinator,
} from "./projection";
import { createSCIMError } from "./scim-error";
import { SCIM_MEDIA_TYPE } from "./scim-metadata";
import {
	createSCIMUser,
	deleteSCIMUser,
	getSCIMUser,
	listSCIMUsers,
	patchSCIMUser,
	replaceSCIMUser,
} from "./user-provisioning";
import { PACKAGE_VERSION } from "./version";

const SCIM_RESPONSE_MARKER = "x-better-auth-scim-response";
const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSCIMErrorBody(value: unknown): boolean {
	return (
		isRecord(value) &&
		Array.isArray(value.schemas) &&
		value.schemas.includes(SCIM_ERROR_SCHEMA)
	);
}

function isAPIErrorLike(value: unknown): value is {
	body: unknown;
	message: string;
	status: keyof typeof statusCodes | Status;
	statusCode: number;
} {
	const isStatus =
		isRecord(value) &&
		((typeof value.status === "string" && value.status in statusCodes) ||
			(typeof value.status === "number" &&
				Object.values(statusCodes).includes(value.status)));
	return (
		isStatus &&
		typeof value.statusCode === "number" &&
		typeof value.message === "string" &&
		"body" in value
	);
}

function createSCIMErrorResponse(
	status: "UNSUPPORTED_MEDIA_TYPE",
	detail: string,
) {
	const error = createSCIMError(status, { detail });
	return new Response(JSON.stringify(error.body), {
		status: error.statusCode,
		headers: { "content-type": SCIM_MEDIA_TYPE },
	});
}

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		scim: {
			creator: typeof scim;
		};
	}
}

function validateConnections(options: SCIMOptions): void {
	if (options.connections.length === 0) {
		throw new BetterAuthError(
			"The scim plugin requires at least one provisioning connection.",
		);
	}

	const connectionIds = new Set<string>();
	const bearerTokens = new Set<string>();
	for (const connection of options.connections) {
		if (
			!connection.id.trim() ||
			connection.id !== connection.id.trim() ||
			connection.id.length > 255
		) {
			throw new BetterAuthError(
				"SCIM connection ids must be trimmed and contain between 1 and 255 characters.",
			);
		}
		if (connection.credentials.length === 0 && !options.authentication) {
			throw new BetterAuthError(
				"SCIM connections require a static credential or bearer token verifier.",
			);
		}
		if (
			connection.provisioningDomainId !== undefined &&
			(!connection.provisioningDomainId.trim() ||
				connection.provisioningDomainId !==
					connection.provisioningDomainId.trim() ||
				connection.provisioningDomainId.length > 255)
		) {
			throw new BetterAuthError(
				"SCIM provisioning domain ids must be trimmed and contain between 1 and 255 characters.",
			);
		}
		if (connectionIds.has(connection.id)) {
			throw new BetterAuthError("SCIM connection ids must be unique.");
		}
		connectionIds.add(connection.id);

		const credentialIds = new Set<string>();
		for (const credential of connection.credentials) {
			if (!isValidSCIMCredentialId(credential.id)) {
				throw new BetterAuthError(
					"SCIM credential ids must be trimmed and contain between 1 and 255 characters.",
				);
			}
			if (credentialIds.has(credential.id)) {
				throw new BetterAuthError(
					"SCIM credential ids must be unique within a connection.",
				);
			}
			credentialIds.add(credential.id);
			if (!credential.token || /\s/.test(credential.token)) {
				throw new BetterAuthError(
					"SCIM bearer tokens cannot be empty or contain whitespace.",
				);
			}
			if (credential.scopes && !areValidSCIMScopes(credential.scopes)) {
				throw new BetterAuthError(
					"SCIM credential scopes must be non-empty, unique, and supported.",
				);
			}
			if (
				credential.expiresAt !== undefined &&
				(!(credential.expiresAt instanceof Date) ||
					Number.isNaN(credential.expiresAt.getTime()))
			) {
				throw new BetterAuthError(
					"SCIM credential expiry must be a valid Date.",
				);
			}
			if (bearerTokens.has(credential.token)) {
				throw new BetterAuthError("SCIM bearer tokens must be unique.");
			}
			bearerTokens.add(credential.token);
		}
	}
}

/**
 * Adds an inbound SCIM 2.0 service provider to Better Auth.
 *
 * Every configured connection owns an isolated set of SCIM resources. The
 * plugin does not require the organization plugin and never represents a
 * provisioned identity as an authentication account.
 */
function createSCIMPlugin(options: SCIMOptions) {
	const connectionMiddleware = createSCIMConnectionMiddleware(options);
	const identity = createSCIMIdentityCoordinator(options);
	const projection = createSCIMProjectionCoordinator(options);

	return {
		id: "scim",
		version: PACKAGE_VERSION,
		async onRequest(request) {
			const path = new URL(request.url).pathname;
			if (!path.includes("/scim/v2/")) return;
			if (request.method === "DELETE") {
				return {
					request: new Request(request.url, {
						method: "DELETE",
						headers: request.headers,
						signal: request.signal,
					}),
				};
			}
			if (!["POST", "PUT", "PATCH"].includes(request.method)) return;

			const mediaType = request.headers
				.get("content-type")
				?.split(";", 1)[0]
				?.trim()
				.toLowerCase();
			if (mediaType === "application/json" || mediaType === SCIM_MEDIA_TYPE) {
				return;
			}
			return {
				response: createSCIMErrorResponse(
					"UNSUPPORTED_MEDIA_TYPE",
					"SCIM requests must use application/scim+json or application/json",
				),
			};
		},
		endpoints: {
			decommissionSCIMConnection: createDecommissionSCIMConnectionEndpoint(
				projection,
				identity,
			),
			reconcileSCIMProjection: createReconcileSCIMProjectionEndpoint(
				options,
				projection,
			),
			createSCIMGroup: createSCIMGroup(connectionMiddleware, projection),
			deleteSCIMGroup: deleteSCIMGroup(connectionMiddleware, projection),
			getSCIMGroup: getSCIMGroup(connectionMiddleware),
			listSCIMGroups: listSCIMGroups(connectionMiddleware),
			patchSCIMGroup: patchSCIMGroup(connectionMiddleware, projection),
			replaceSCIMGroup: replaceSCIMGroup(connectionMiddleware, projection),
			createSCIMUser: createSCIMUser(
				connectionMiddleware,
				identity,
				projection,
			),
			deleteSCIMUser: deleteSCIMUser(
				connectionMiddleware,
				identity,
				projection,
			),
			getSCIMUser: getSCIMUser(connectionMiddleware),
			listSCIMUsers: listSCIMUsers(connectionMiddleware),
			patchSCIMUser: patchSCIMUser(connectionMiddleware, identity, projection),
			replaceSCIMUser: replaceSCIMUser(
				connectionMiddleware,
				identity,
				projection,
			),
			getSCIMServiceProviderConfig,
			getSCIMSchemas,
			getSCIMSchema,
			getSCIMResourceTypes,
			getSCIMResourceType,
		},
		async onResponse(response) {
			if (response.headers.get(SCIM_RESPONSE_MARKER) !== "1") return;
			const headers = new Headers(response.headers);
			headers.delete(SCIM_RESPONSE_MARKER);
			headers.set("content-type", SCIM_MEDIA_TYPE);
			return {
				response: new Response(response.body, {
					status: response.status,
					statusText: response.statusText,
					headers,
				}),
			};
		},
		hooks: {
			after: [
				{
					matcher: (context) => context.path?.startsWith("/scim/v2") === true,
					handler: createAuthMiddleware(async (ctx) => {
						ctx.setHeader(SCIM_RESPONSE_MARKER, "1");
						const returned: unknown = ctx.context.returned;
						if (!isAPIErrorLike(returned) || isSCIMErrorBody(returned.body)) {
							return;
						}
						const body: unknown = returned.body;
						const detail =
							isRecord(body) && typeof body.message === "string"
								? body.message
								: returned.message;
						throw createSCIMError(returned.status, {
							detail,
							...(returned.statusCode === 400
								? { scimType: "invalidValue" as const }
								: {}),
						});
					}),
				},
			],
		},
		schema: {
			scimConnectionBinding: {
				fields: {
					connectionId: {
						type: "string",
						required: true,
						index: true,
					},
					connectionKey: {
						type: "string",
						required: true,
						unique: true,
						returned: false,
					},
					provisioningDomainId: {
						type: "string",
						required: true,
					},
					createdAt: {
						type: "date",
						required: true,
					},
					decommissionedAt: {
						type: "date",
						required: false,
					},
					decommissionStatus: {
						type: "string",
						required: true,
						defaultValue: "active",
					},
					decommissionCursorUserId: {
						type: "string",
						required: false,
						returned: false,
					},
					decommissionReconciledUserCount: {
						type: "number",
						required: true,
						defaultValue: 0,
					},
					decommissionBatchCount: {
						type: "number",
						required: true,
						defaultValue: 0,
					},
					decommissionRevision: {
						type: "number",
						required: true,
						defaultValue: 0,
						returned: false,
					},
					decommissionCompletedAt: {
						type: "date",
						required: false,
					},
					decommissionLeaseId: {
						type: "string",
						required: false,
						returned: false,
					},
					decommissionLeaseExpiresAt: {
						type: "date",
						required: false,
						returned: false,
					},
				},
			},
			scimIdentityTombstone: {
				fields: {
					connectionId: {
						type: "string",
						required: true,
						index: true,
					},
					provisioningDomainId: {
						type: "string",
						required: true,
						index: true,
					},
					externalId: {
						type: "string",
						required: true,
					},
					externalIdKey: {
						type: "string",
						required: true,
						unique: true,
						returned: false,
					},
					userId: {
						type: "string",
						required: true,
						index: true,
						references: {
							model: "user",
							field: "id",
						},
					},
					profile: {
						type: "string",
						required: true,
					},
					deletedAt: {
						type: "date",
						required: true,
					},
				},
			},
			scimSubject: {
				fields: {
					userId: {
						type: "string",
						required: true,
						unique: true,
						references: {
							model: "user",
							field: "id",
						},
					},
					profileSourceId: {
						type: "string",
						required: false,
						index: true,
					},
					revision: {
						type: "number",
						required: true,
					},
					createdAt: {
						type: "date",
						required: true,
					},
					updatedAt: {
						type: "date",
						required: true,
					},
				},
			},
			scimUser: {
				fields: {
					connectionId: {
						type: "string",
						required: true,
						index: true,
					},
					provisioningDomainId: {
						type: "string",
						required: true,
						index: true,
					},
					userId: {
						type: "string",
						required: true,
						index: true,
						references: {
							model: "user",
							field: "id",
						},
					},
					connectionUserKey: {
						type: "string",
						required: true,
						unique: true,
						returned: false,
					},
					userName: {
						type: "string",
						required: true,
					},
					userNameKey: {
						type: "string",
						required: true,
						unique: true,
						returned: false,
					},
					primaryEmail: {
						type: "string",
						required: true,
					},
					workEmailValueIndex: {
						type: "string",
						required: true,
						returned: false,
					},
					emailValueIndex: {
						type: "string",
						required: true,
						returned: false,
					},
					displayName: {
						type: "string",
						required: true,
					},
					formattedName: {
						type: "string",
						required: true,
					},
					givenName: {
						type: "string",
						required: false,
					},
					familyName: {
						type: "string",
						required: false,
					},
					serializedEmails: {
						type: "string",
						required: true,
						returned: false,
					},
					externalId: {
						type: "string",
						required: false,
					},
					externalIdKey: {
						type: "string",
						required: false,
						unique: true,
						returned: false,
					},
					active: {
						type: "boolean",
						required: true,
					},
					orderKey: {
						type: "string",
						required: true,
						unique: true,
						returned: false,
					},
					createdAt: {
						type: "date",
						required: true,
					},
					updatedAt: {
						type: "date",
						required: true,
					},
				},
			},
			scimProjectionGrant: {
				fields: {
					connectionId: {
						type: "string",
						required: true,
						index: true,
					},
					provisioningDomainId: {
						type: "string",
						required: true,
						index: true,
					},
					scimUserId: {
						type: "string",
						required: true,
						index: true,
						references: {
							model: "scimUser",
							field: "id",
						},
					},
					userId: {
						type: "string",
						required: true,
						index: true,
						references: {
							model: "user",
							field: "id",
						},
					},
					sourceKind: {
						type: "string",
						required: true,
					},
					sourceId: {
						type: "string",
						required: true,
					},
					sourceValue: {
						type: "string",
						required: false,
					},
					role: {
						type: "string",
						required: true,
					},
					grantKey: {
						type: "string",
						required: true,
						unique: true,
						returned: false,
					},
					createdAt: {
						type: "date",
						required: true,
					},
					updatedAt: {
						type: "date",
						required: true,
					},
				},
			},
			scimGroup: {
				fields: {
					connectionId: {
						type: "string",
						required: true,
						index: true,
					},
					provisioningDomainId: {
						type: "string",
						required: true,
						index: true,
					},
					revision: {
						type: "number",
						required: true,
						defaultValue: 0,
						returned: false,
					},
					displayName: {
						type: "string",
						required: true,
					},
					displayNameKey: {
						type: "string",
						required: true,
						unique: true,
						returned: false,
					},
					externalId: {
						type: "string",
						required: false,
					},
					externalIdKey: {
						type: "string",
						required: false,
						unique: true,
						returned: false,
					},
					orderKey: {
						type: "string",
						required: true,
						unique: true,
						returned: false,
					},
					createdAt: {
						type: "date",
						required: true,
					},
					updatedAt: {
						type: "date",
						required: true,
					},
				},
			},
			scimGroupMember: {
				fields: {
					connectionId: {
						type: "string",
						required: true,
						index: true,
					},
					groupId: {
						type: "string",
						required: true,
						index: true,
						references: {
							model: "scimGroup",
							field: "id",
						},
					},
					scimUserId: {
						type: "string",
						required: true,
						index: true,
						references: {
							model: "scimUser",
							field: "id",
						},
					},
					membershipKey: {
						type: "string",
						required: true,
						unique: true,
						returned: false,
					},
					createdAt: {
						type: "date",
						required: true,
					},
				},
			},
		},
		options,
	} satisfies BetterAuthPlugin;
}

/** The Better Auth plugin returned by {@link scim}. */
export type SCIMPlugin = ReturnType<typeof createSCIMPlugin>;

/** The server endpoints installed by the SCIM plugin. */
export type SCIMEndpoints = SCIMPlugin["endpoints"];

/**
 * Adds an inbound SCIM 2.0 service provider to Better Auth.
 *
 * Every configured connection owns an isolated set of SCIM resources. The
 * plugin does not require the organization plugin and never represents a
 * provisioned identity as an authentication account.
 */
export function scim(options: SCIMOptions): SCIMPlugin {
	validateConnections(options);
	return createSCIMPlugin(options);
}

export type {
	SCIMAuthenticationOptions,
	SCIMAuthorizationSource,
	SCIMBearerCredentialOptions,
	SCIMBearerTokenVerificationInput,
	SCIMBearerTokenVerificationResult,
	SCIMCanonicalEmail,
	SCIMCanonicalName,
	SCIMCanonicalUser,
	SCIMConnectionDecommissionStatus,
	SCIMConnectionOptions,
	SCIMEmail,
	SCIMGroupAuthorizationSource,
	SCIMIdentity,
	SCIMIdentityResolution,
	SCIMIdentityResolutionContext,
	SCIMIdentityResolutionInput,
	SCIMIdentitySource,
	SCIMIdentityState,
	SCIMName,
	SCIMOAuthBearerPrincipal,
	SCIMOptions,
	SCIMPrincipal,
	SCIMProjectedRoleGrant,
	SCIMProjectedUserState,
	SCIMProjection,
	SCIMRoleExistenceInput,
	SCIMRoleMappingInput,
	SCIMRoleProjection,
	SCIMScope,
	SCIMStaticBearerPrincipal,
	SCIMTransactionContext,
} from "./configuration";
