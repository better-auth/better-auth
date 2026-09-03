import type { BetterAuthPlugin, Status } from "better-auth";
import { BetterAuthError } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { statusCodes } from "better-call";
import { normalizeSCIMUserEntraCompatibilityRequestBody } from "./active-normalization";
import type { SCIMOptions } from "./configuration";
import {
	areValidSCIMScopes,
	createSCIMConnectionMiddleware,
	isValidSCIMConnectionIdentifier,
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
import { normalizeMicrosoftEntraGroupSchema } from "./group-schemas";
import {
	acquireActiveSCIMUserLink,
	createSCIMIdentityCoordinator,
} from "./identity";
import {
	createSCIMManagedConnectionEndpoints,
	managedSCIMSchema,
	resolveManagedConnectionOptions,
	SCIM_MANAGED_CONNECTION_ID_PREFIX,
} from "./managed-connections";
import {
	createReconcileSCIMProjectionEndpoint,
	createSCIMProjectionCoordinator,
} from "./projection";
import { createSCIMError } from "./scim-error";
import { SCIM_MEDIA_TYPE } from "./scim-metadata";
import { assertNativeSCIMTransactions } from "./transaction";
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

interface APIErrorLike {
	body: unknown;
	message: string;
	status: keyof typeof statusCodes | Status;
	statusCode: number;
}

function isAPIErrorLike(value: unknown): value is APIErrorLike {
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
	status: "BAD_REQUEST" | "UNSUPPORTED_MEDIA_TYPE",
	detail: string,
	scimType?: "invalidSyntax" | "invalidValue",
) {
	const error = createSCIMError(status, {
		detail,
		...(scimType ? { scimType } : {}),
	});
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
	const authenticationProvided = options.authentication !== undefined;
	const managedConnectionsProvided = options.managedConnections !== undefined;
	const hasBearerTokenVerifier =
		typeof options.authentication?.verifyBearerToken === "function";
	if (authenticationProvided && !hasBearerTokenVerifier) {
		throw new BetterAuthError(
			"SCIM authentication requires a callable verifyBearerToken.",
		);
	}
	if (managedConnectionsProvided) {
		if (
			typeof options.managedConnections?.credentialHashSecret !== "string" ||
			options.managedConnections.credentialHashSecret.length < 32
		) {
			throw new BetterAuthError(
				"SCIM managed credentialHashSecret must contain at least 32 characters.",
			);
		}
		const maxActiveCredentials =
			options.managedConnections.maxActiveCredentials ?? 5;
		if (
			!Number.isInteger(maxActiveCredentials) ||
			maxActiveCredentials < 1 ||
			maxActiveCredentials > 100
		) {
			throw new BetterAuthError(
				"SCIM managed maxActiveCredentials must be an integer between 1 and 100.",
			);
		}
		const lastUsedWriteIntervalSeconds =
			options.managedConnections.lastUsedWriteIntervalSeconds ?? 300;
		if (
			!Number.isInteger(lastUsedWriteIntervalSeconds) ||
			lastUsedWriteIntervalSeconds < 0
		) {
			throw new BetterAuthError(
				"SCIM managed lastUsedWriteIntervalSeconds must be a non-negative integer.",
			);
		}
	}
	if (
		options.connections.length === 0 &&
		!hasBearerTokenVerifier &&
		!managedConnectionsProvided
	) {
		throw new BetterAuthError(
			"The scim plugin requires a provisioning connection, bearer token verifier, or managed connection catalog.",
		);
	}

	const connectionIds = new Set<string>();
	const bearerTokens = new Set<string>();
	for (const connection of options.connections) {
		if (!isValidSCIMConnectionIdentifier(connection.id)) {
			throw new BetterAuthError(
				"SCIM connection ids must be trimmed and contain between 1 and 255 characters.",
			);
		}
		if (connection.id.startsWith(SCIM_MANAGED_CONNECTION_ID_PREFIX)) {
			throw new BetterAuthError(
				`Static SCIM connection ids cannot use the reserved "${SCIM_MANAGED_CONNECTION_ID_PREFIX}" prefix.`,
			);
		}
		if (connection.credentials.length === 0 && !hasBearerTokenVerifier) {
			throw new BetterAuthError(
				"SCIM connections require a static credential or bearer token verifier.",
			);
		}
		if (
			connection.provisioningDomainId !== undefined &&
			!isValidSCIMConnectionIdentifier(connection.provisioningDomainId)
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
	const managedConnectionEndpoints = createSCIMManagedConnectionEndpoints(
		options.managedConnections
			? resolveManagedConnectionOptions(options.managedConnections)
			: undefined,
		projection,
		identity,
	);

	return {
		id: "scim",
		version: PACKAGE_VERSION,
		init(ctx) {
			assertNativeSCIMTransactions(ctx.adapter);
		},
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
			if (mediaType !== "application/json" && mediaType !== SCIM_MEDIA_TYPE) {
				return {
					response: createSCIMErrorResponse(
						"UNSUPPORTED_MEDIA_TYPE",
						"SCIM requests must use application/scim+json or application/json",
					),
				};
			}
			let body: unknown;
			try {
				body = JSON.parse(await request.clone().text());
			} catch {
				return {
					response: createSCIMErrorResponse(
						"BAD_REQUEST",
						"SCIM request body must contain valid JSON",
						"invalidSyntax",
					),
				};
			}
			const isUserMutation =
				/\/scim\/v2\/Users(?:\/[^/]+)?$/.test(path) &&
				((request.method === "POST" && path.endsWith("/Users")) ||
					(["PUT", "PATCH"].includes(request.method) &&
						!path.endsWith("/Users")));
			const isGroupCreate =
				request.method === "POST" && /\/scim\/v2\/Groups$/.test(path);
			const isGroupMutation =
				/\/scim\/v2\/Groups(?:\/[^/]+)?$/.test(path) &&
				(isGroupCreate ||
					(["PUT", "PATCH"].includes(request.method) &&
						!path.endsWith("/Groups")));
			let normalizedBody = body;
			if (isGroupMutation) {
				const groupNormalization = normalizeMicrosoftEntraGroupSchema(
					normalizedBody,
					isGroupCreate &&
						options.compatibility?.microsoftEntra?.acceptLegacyGroupSchema ===
							true,
				);
				if (!groupNormalization.ok) {
					return {
						response: createSCIMErrorResponse(
							"BAD_REQUEST",
							groupNormalization.detail,
							"invalidValue",
						),
					};
				}
				normalizedBody = groupNormalization.body;
			}
			if (isUserMutation) {
				normalizedBody = normalizeSCIMUserEntraCompatibilityRequestBody(
					request.method,
					normalizedBody,
				);
			}
			if (normalizedBody === body) return;
			const headers = new Headers(request.headers);
			headers.delete("content-length");
			return {
				request: new Request(request.url, {
					method: request.method,
					headers,
					body: JSON.stringify(normalizedBody),
					signal: request.signal,
				}),
			};
		},
		endpoints: {
			...managedConnectionEndpoints,
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
						const validationError =
							returned.statusCode === 400 &&
							isRecord(body) &&
							body.code === "VALIDATION_ERROR";
						throw createSCIMError(returned.status, {
							detail,
							...(validationError ? { scimType: "invalidValue" as const } : {}),
						});
					}),
				},
			],
		},
		schema: {
			...(options.managedConnections ? managedSCIMSchema : {}),
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
					serializedAttributes: {
						type: "string",
						required: false,
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
	SCIMBearerTokenVerification,
	SCIMBearerTokenVerificationContext,
	SCIMBearerTokenVerificationInput,
	SCIMCanonicalAddress,
	SCIMCanonicalEmail,
	SCIMCanonicalEntitlement,
	SCIMCanonicalManager,
	SCIMCanonicalName,
	SCIMCanonicalPhoneNumber,
	SCIMCanonicalRole,
	SCIMCanonicalUser,
	SCIMCompatibilityOptions,
	SCIMConnection,
	SCIMConnectionDecommissionStatus,
	SCIMConnectionOptions,
	SCIMDeclaredConnectionVerificationResult,
	SCIMEmail,
	SCIMEnterpriseUser,
	SCIMGroupAuthorizationSource,
	SCIMIdentity,
	SCIMIdentityResolution,
	SCIMIdentityResolutionContext,
	SCIMIdentityResolutionInput,
	SCIMIdentitySource,
	SCIMIdentityState,
	SCIMManagedBearerPrincipal,
	SCIMManagedConnectionOptions,
	SCIMMicrosoftEntraCompatibilityOptions,
	SCIMName,
	SCIMOAuthBearerPrincipal,
	SCIMOptions,
	SCIMPrincipal,
	SCIMProjectedRoleGrant,
	SCIMProjectedUserState,
	SCIMProjection,
	SCIMResolvedConnectionVerificationResult,
	SCIMRoleExistenceInput,
	SCIMRoleMappingInput,
	SCIMRoleProjection,
	SCIMScope,
	SCIMStaticBearerPrincipal,
	SCIMTransactionContext,
} from "./configuration";
export type {
	SCIMActiveUserLink,
	SCIMActiveUserLinkContext,
	SCIMUserExternalIdReference,
} from "./identity";
export type {
	SCIMManagedConnection,
	SCIMManagedConnectionEvent,
	SCIMManagedConnectionEventType,
	SCIMManagedConnectionStatus,
	SCIMManagedCredential,
	SCIMManagedCredentialStatus,
} from "./managed-connections";
export { SCIM_MANAGED_CREATION_REQUEST_ID_CONFLICT } from "./managed-connections";
export { acquireActiveSCIMUserLink };
