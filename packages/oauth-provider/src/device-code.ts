import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import { appendQueryParams } from "@better-auth/core/utils/url";
import { APIError } from "better-auth/api";
import type {
	DeviceAuthorizationGrant,
	DeviceAuthorizationPluginOptions,
	DeviceCode,
} from "better-auth/plugins/device-authorization";
import {
	assertDeviceCodePending,
	buildVerificationUris,
	decideDeviceCode,
	deviceAuthorization,
	findDeviceCodeByUserCode,
	redeemDeviceCode,
} from "better-auth/plugins/device-authorization";
import * as z from "zod";
import { extendOAuthProvider } from "./extensions";
import { resolveResourcePolicy } from "./resources";
import { getOAuthProviderApi } from "./token";
import type {
	OAuthExtensionGrantHandlerInput,
	OAuthInteractionRequestHandler,
	OAuthProviderExtension,
	OAuthTokenResponse,
} from "./types";
import { ResourceUriSchema } from "./types/zod";
import {
	getClient,
	getOAuthProviderPlugin,
	normalizeClientAuthenticationParameters,
	normalizeTimestampValue,
	readFormParams,
	toResourceList,
	validateClientScopes,
} from "./utils";

/**
 * RFC 8628 device authorization grant type. A registered OAuth client polls the
 * token endpoint with this `grant_type` to exchange an approved device code for
 * a first-class OAuth token set.
 */
export const DEVICE_CODE_GRANT_TYPE =
	"urn:ietf:params:oauth:grant-type:device_code";

/**
 * Path of the device authorization request endpoint contributed by the
 * `device-authorization` plugin and advertised in provider discovery metadata.
 */
const DEVICE_AUTHORIZATION_PATH = "/device/code";

const deviceCodeResourceSchema = z.union([
	ResourceUriSchema,
	z.array(ResourceUriSchema).min(1),
	z.literal(""),
]);

const oauthDeviceRequestFields = {
	client_secret: z
		.string()
		.meta({ description: "OAuth client secret" })
		.optional(),
	client_assertion: z
		.string()
		.meta({ description: "OAuth client assertion" })
		.optional(),
	client_assertion_type: z
		.string()
		.meta({ description: "OAuth client assertion type" })
		.optional(),
	resource: deviceCodeResourceSchema
		.meta({
			description:
				"RFC 8707 resource indicator(s) to bind to this authorization request",
		})
		.optional(),
};

/** OAuth-owned fields added to the device authorization record. */
type OAuthDeviceCodeFields = {
	oauthClientId?: string | null;
	resources?: string[] | null;
	referenceId?: string | null;
	authTime?: Date | null;
};

function tokenError(
	status: "BAD_REQUEST" | "UNAUTHORIZED" | "INTERNAL_SERVER_ERROR",
	error: string,
	errorDescription: string,
): never {
	throw new APIError(status, {
		error,
		error_description: errorDescription,
	});
}

function parseScopes(scope: string | null | undefined): string[] {
	const normalized = scope?.trim();
	return normalized ? normalized.split(/\s+/) : [];
}

/**
 * Exchanges an approved RFC 8628 device code for an OAuth token set. Unlike the
 * device-authorization plugin's `/device/token` (which mints a first-party
 * session token), this issues a real OAuth token through the provider's shared
 * issuance: scoped, audience-bound, introspectable, with optional refresh and ID
 * tokens. The device-authorization plugin owns the record and runs the shared
 * polling and atomic-consumption state machine for this handler.
 */
async function exchangeOAuthDeviceCode(
	input: OAuthExtensionGrantHandlerInput,
): Promise<OAuthTokenResponse> {
	const { ctx, provider } = input;
	const body = ctx.body as
		| { device_code?: string; client_id?: string; resource?: string | string[] }
		| undefined;
	const deviceCode = body?.device_code;
	if (!deviceCode) {
		tokenError("BAD_REQUEST", "invalid_request", "device_code is required");
	}

	type ClientAuthorization = Awaited<
		ReturnType<typeof provider.authenticateClient>
	> & { scopes: string[] };
	const {
		authorizationContext: { client, confirmation, scopes },
		claimedDeviceCode,
		redemptionContext: resources,
		user,
	} = await redeemDeviceCode<
		OAuthDeviceCodeFields,
		ClientAuthorization,
		string[] | undefined
	>({
		ctx,
		deviceCode,
		authorizeRedemption: async (record) => {
			if (!record.oauthClientId) {
				tokenError("BAD_REQUEST", "invalid_grant", "invalid device code");
			}
			// Reject mismatched body credentials before scope validation so a stolen
			// code cannot disclose the scopes recorded for another client.
			if (body?.client_id && record.oauthClientId !== body.client_id) {
				tokenError("BAD_REQUEST", "invalid_grant", "Client ID mismatch");
			}

			const scopes = parseScopes(record.scope);
			const authentication = await provider.authenticateClient({
				requireCredentials: false,
			});
			if (record.oauthClientId !== authentication.client.clientId) {
				tokenError("BAD_REQUEST", "invalid_grant", "Client ID mismatch");
			}
			validateClientScopes(authentication.client, scopes);
			return {
				ownershipWhere: {
					field: "oauthClientId",
					value: authentication.client.clientId,
				},
				context: { ...authentication, scopes },
			};
		},
		prepareRedemption: async (record, authorization) => {
			const requestedResources = toResourceList(body?.resource);
			const boundResources = record.resources ?? undefined;
			if (requestedResources) {
				const boundResourceSet = new Set(boundResources);
				if (
					!boundResources ||
					requestedResources.some((resource) => !boundResourceSet.has(resource))
				) {
					tokenError(
						"BAD_REQUEST",
						"invalid_target",
						"Requested resource was not authorized by the user",
					);
				}
			}
			const resources = requestedResources ?? boundResources;
			// Validate before the atomic claim: an invalid target must not consume a
			// one-time code that can still be exchanged with its authorized resources.
			await resolveResourcePolicy(ctx, input.opts, {
				resource: resources,
				clientId: authorization.client.clientId,
				requestedScopes: authorization.scopes,
			});
			return resources;
		},
	});

	return provider.issueTokens({
		client,
		scopes,
		user,
		resources,
		referenceId: claimedDeviceCode.referenceId ?? undefined,
		authTime: normalizeTimestampValue(claimedDeviceCode.authTime),
		// Forward a sender-constraint a confidential client-auth strategy proved.
		confirmation,
	});
}

/**
 * Lets the user approve an OAuth device code through `/oauth2/authorize`, so
 * device approvals run the same sign-in, account selection, post-login, and
 * consent pages as authorization requests. The user is bound to the code only
 * at the final approval, after any account switch.
 */
function deviceApprovalRequest(
	verificationUri: string | undefined,
): OAuthInteractionRequestHandler {
	async function findOAuthDeviceCode(
		ctx: GenericEndpointContext,
		userCode: string,
	) {
		const deviceCode = (await findDeviceCodeByUserCode(ctx, userCode)) as
			| (DeviceCode & OAuthDeviceCodeFields)
			| null;
		if (!deviceCode?.oauthClientId) {
			tokenError("BAD_REQUEST", "invalid_request", "Invalid user code");
		}
		return { ...deviceCode, oauthClientId: deviceCode.oauthClientId };
	}
	// Sends the user back to the device verification page with the outcome.
	const completionURL = (
		ctx: GenericEndpointContext,
		userCode: string,
		status: "approved" | "denied",
	) =>
		appendQueryParams(
			buildVerificationUris(verificationUri, ctx.context.baseURL, userCode)
				.verificationUriComplete,
			new URLSearchParams({ status }),
		);

	return {
		load: async ({ ctx, opts, value, signedQuery }) => {
			const deviceCode = await findOAuthDeviceCode(ctx, value);
			assertDeviceCodePending(deviceCode);
			const client = await getClient(ctx, opts, deviceCode.oauthClientId);
			if (!client) {
				tokenError("BAD_REQUEST", "invalid_client", "client_id is required");
			}
			if (client.disabled) {
				tokenError("BAD_REQUEST", "client_disabled", "client is disabled");
			}
			// The consent page may have narrowed the scopes of a signed query.
			const scopes = parseScopes(signedQuery?.scope ?? deviceCode.scope);
			const query = {
				user_code: deviceCode.userCode,
				client_id: client.clientId,
				scope: scopes.join(" "),
				resource: deviceCode.resources ?? [],
			};
			return {
				query,
				client,
				// RFC 8628 section 5.4: the user who approves must see consent.
				requireConsent: true,
				approve: async (approval) => {
					await decideDeviceCode(ctx, {
						deviceCode,
						userId: approval.userId,
						decision: "approved",
						fields: {
							scope: approval.query.scope,
							referenceId: approval.referenceId ?? null,
							authTime: new Date(approval.authTime),
						},
					});
					return completionURL(ctx, deviceCode.userCode, "approved");
				},
			};
		},
		deny: async ({ ctx, value, userId }) => {
			const deviceCode = await findOAuthDeviceCode(ctx, value);
			await decideDeviceCode(ctx, {
				deviceCode,
				userId,
				decision: "denied",
			});
			return completionURL(ctx, deviceCode.userCode, "denied");
		},
	};
}

function buildOAuthDeviceGrant(verificationUri: string | undefined) {
	return {
		requestSchemaFields: oauthDeviceRequestFields,
		requestErrorCodes: ["invalid_target"] as const,
		requestOpenAPIResponses: {
			401: {
				description: "Invalid Basic client authentication",
				headers: {
					"WWW-Authenticate": {
						description: "Basic client authentication challenge",
						schema: { type: "string", example: "Basic" },
					},
				},
				content: {
					"application/json": {
						schema: {
							type: "object",
							properties: {
								error: {
									type: "string",
									enum: ["invalid_client"],
								},
								error_description: { type: "string" },
							},
							required: ["error"],
						},
					},
				},
			},
		},
		onRequestValidationError: (issues) => {
			if (
				issues.length > 0 &&
				issues.every((issue) => issue.path?.[0] === "resource")
			) {
				tokenError(
					"BAD_REQUEST",
					"invalid_target",
					"Invalid resource indicator",
				);
			}
		},
		deviceCodeSchemaFields: {
			resources: {
				type: "string[]",
				required: false,
			},
			oauthClientId: {
				type: "string",
				required: false,
			},
			referenceId: {
				type: "string",
				required: false,
			},
			authTime: {
				type: "date",
				required: false,
			},
		},
		grants: {
			[DEVICE_CODE_GRANT_TYPE]: exchangeOAuthDeviceCode,
		},
		metadata: (metadataInput) => ({
			device_authorization_endpoint: `${metadataInput.ctx.context.baseURL}${DEVICE_AUTHORIZATION_PATH}`,
		}),
		authorizeRequest: async ({ ctx, request }) => {
			const { detected: hasClientAuthentication } =
				await normalizeClientAuthenticationParameters(
					ctx.request,
					(ctx.body ?? {}) as Record<string, unknown>,
				);
			const formResources = ctx.request
				? (await readFormParams(ctx.request))
						?.getAll("resource")
						.filter(Boolean)
				: undefined;
			if (formResources?.length) {
				const parsedResource = deviceCodeResourceSchema.safeParse(
					formResources.length === 1 ? formResources[0] : formResources,
				);
				if (!parsedResource.success) {
					tokenError(
						"BAD_REQUEST",
						"invalid_target",
						"Invalid resource indicator",
					);
				}
				request.resource = parsedResource.data;
			}
			const provider = getOAuthProviderPlugin(ctx.context);
			if (!provider) return;
			const scopes = parseScopes(request.scope);
			if (request.scope !== undefined) {
				request.scope = scopes.join(" ");
			}
			const resource = request.resource === "" ? undefined : request.resource;
			const api = getOAuthProviderApi(
				ctx,
				provider.options,
				DEVICE_CODE_GRANT_TYPE,
			);
			if (!request.client_id && !hasClientAuthentication) {
				tokenError("BAD_REQUEST", "invalid_request", "client_id is required");
			}
			const oauthClient = request.client_id
				? await getClient(ctx, provider.options, request.client_id)
				: undefined;
			// Requests from unknown ids remain in the standalone session flow only
			// when the caller did not also present OAuth client credentials.
			if (request.client_id && !oauthClient && !hasClientAuthentication) return;
			const authenticated = await api.authenticateClient({
				scopes,
				requireCredentials: false,
			});
			if (request.client_id && authenticated.clientId !== request.client_id) {
				tokenError("BAD_REQUEST", "invalid_client", "Client ID mismatch");
			}
			await resolveResourcePolicy(ctx, provider.options, {
				resource,
				clientId: authenticated.clientId,
				requestedScopes: scopes,
			});
			return {
				clientId: authenticated.clientId,
				deviceCodeFields: {
					oauthClientId: authenticated.clientId,
					resources: toResourceList(resource) ?? null,
				},
			};
		},
		assertStandaloneUse: ({ deviceCode, use }) => {
			if (typeof deviceCode.oauthClientId !== "string") return;
			if (use === "redeem") {
				tokenError(
					"BAD_REQUEST",
					"invalid_grant",
					"This device code must be exchanged at the OAuth token endpoint (/oauth2/token).",
				);
			}
			tokenError(
				"BAD_REQUEST",
				"invalid_request",
				`Approve this device code through the OAuth provider: send the user to /oauth2/authorize?user_code=${encodeURIComponent(String(deviceCode.userCode))}.`,
			);
		},
		interactionRequests: {
			user_code: deviceApprovalRequest(verificationUri),
		},
	} satisfies DeviceAuthorizationGrant<typeof oauthDeviceRequestFields> &
		OAuthProviderExtension;
}

type OAuthDeviceGrant = ReturnType<typeof buildOAuthDeviceGrant>;

/** Options for the OAuth Device Authorization integration. */
export type OAuthDeviceAuthorizationOptions = Omit<
	DeviceAuthorizationPluginOptions<OAuthDeviceGrant>,
	"grant"
>;

/**
 * Enables the {@link https://datatracker.ietf.org/doc/html/rfc8628 RFC 8628}
 * device authorization grant for OAuth Provider. Device Authorization owns
 * code creation and user approval; OAuth Provider owns client validation and
 * token issuance.
 *
 * Pair this plugin with `oauthProvider()` or `mcp()`. First-party device login
 * continues to use `deviceAuthorization()` and `/device/token` instead.
 *
 * @example
 * ```ts
 * const auth = betterAuth({
 *   plugins: [
 *     oauthProvider({ ... }),
 *     oauthDeviceAuthorization(),
 *   ],
 * });
 * ```
 */
export function oauthDeviceAuthorization(
	options: OAuthDeviceAuthorizationOptions = {},
) {
	const grant = buildOAuthDeviceGrant(options.verificationUri);
	const plugin = deviceAuthorization({ ...options, grant });

	return {
		...plugin,
		init(ctx: AuthContext) {
			const deviceAuthorizationPluginCount =
				ctx.options.plugins?.filter(
					(configuredPlugin) => configuredPlugin.id === "device-authorization",
				).length ?? 0;
			if (deviceAuthorizationPluginCount > 1) {
				throw new BetterAuthError(
					"oauthDeviceAuthorization() cannot be combined with another Device Authorization plugin.",
				);
			}
			if (!ctx.getPlugin("oauth-provider")) {
				throw new BetterAuthError(
					"oauthDeviceAuthorization() requires oauthProvider() or mcp().",
				);
			}
			extendOAuthProvider(ctx, grant);
		},
	};
}
