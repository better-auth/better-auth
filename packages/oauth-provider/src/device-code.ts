import type { AuthContext } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import { APIError } from "better-auth/api";
import type {
	DeviceAuthorizationGrant,
	DeviceAuthorizationPluginOptions,
} from "better-auth/plugins/device-authorization";
import {
	deviceAuthorization,
	redeemDeviceCode,
} from "better-auth/plugins/device-authorization";
import * as z from "zod";
import { extendOAuthProvider } from "./extensions";
import {
	extractRepeatedResourceFromForm,
	resolveResourcePolicy,
} from "./resources";
import { getOAuthProviderApi } from "./token";
import type {
	OAuthExtensionGrantHandlerInput,
	OAuthProviderExtension,
	OAuthTokenResponse,
} from "./types";
import { ResourceUriSchema } from "./types/zod";
import {
	getClient,
	getOAuthProviderPlugin,
	toAudienceClaim,
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

const clientAuthenticationFields = [
	"client_secret",
	"client_assertion",
	"client_assertion_type",
] as const;

type ClientAuthenticationField = (typeof clientAuthenticationFields)[number];

type ClientAuthenticationAttempt = {
	detected: boolean;
	fields: Partial<Record<ClientAuthenticationField, string>>;
};

/**
 * Recovers OAuth authentication fields stripped by the device endpoint's
 * protocol-specific Zod schema. This only detects and restores an attempt;
 * extractClientCredentials remains responsible for authentication semantics.
 */
async function readClientAuthenticationAttempt(
	request: Request | undefined,
): Promise<ClientAuthenticationAttempt> {
	const fields: Partial<Record<ClientAuthenticationField, string>> = {};
	let detected = Boolean(request?.headers.get("authorization"));
	if (!request) return { detected, fields };

	const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
	if (contentType.includes("application/x-www-form-urlencoded")) {
		const params = new URLSearchParams(await request.clone().text());
		for (const field of clientAuthenticationFields) {
			if (!params.has(field)) continue;
			detected = true;
			fields[field] = params.get(field) ?? "";
		}
	} else if (contentType.includes("application/json")) {
		let body: unknown;
		try {
			body = await request.clone().json();
		} catch {
			return { detected, fields };
		}
		if (!body || typeof body !== "object" || Array.isArray(body)) {
			return { detected, fields };
		}
		const objectBody = body as Record<string, unknown>;
		for (const field of clientAuthenticationFields) {
			if (!(field in objectBody)) continue;
			detected = true;
			const value = objectBody[field];
			if (typeof value === "string") fields[field] = value;
		}
	}
	return { detected, fields };
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
		// Forward a sender-constraint a confidential client-auth strategy proved.
		confirmation,
	});
}

function buildOAuthDeviceGrant() {
	return {
		requestSchemaFields: oauthDeviceRequestFields,
		requestErrorCodes: ["invalid_target"] as const,
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
		},
		grants: {
			[DEVICE_CODE_GRANT_TYPE]: exchangeOAuthDeviceCode,
		},
		metadata: (metadataInput) => ({
			device_authorization_endpoint: `${metadataInput.ctx.context.baseURL}${DEVICE_AUTHORIZATION_PATH}`,
		}),
		authorizeRequest: async ({ ctx, request }) => {
			const clientAuthentication = await readClientAuthenticationAttempt(
				ctx.request,
			);
			Object.assign(
				ctx.body as Record<string, unknown>,
				clientAuthentication.fields,
			);
			const formResources = ctx.request
				? await extractRepeatedResourceFromForm(ctx.request)
				: undefined;
			if (formResources) {
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
			const hasClientAuthentication = clientAuthentication.detected;
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
			request.client_id = authenticated.clientId;
			await resolveResourcePolicy(ctx, provider.options, {
				resource,
				clientId: authenticated.clientId,
				requestedScopes: scopes,
			});
			return {
				oauthClientId: authenticated.clientId,
				resources: toResourceList(resource) ?? null,
			};
		},
		assertSessionRedemption: ({ deviceCode }) => {
			if (typeof deviceCode.oauthClientId !== "string") return;
			throw new APIError("BAD_REQUEST", {
				error: "invalid_grant",
				error_description:
					"This device code must be exchanged at the OAuth token endpoint (/oauth2/token).",
			});
		},
		getVerificationContext: (deviceCode) => {
			if (typeof deviceCode.oauthClientId !== "string") return;
			const resources = deviceCode.resources;
			if (
				!Array.isArray(resources) ||
				!resources.every((resource) => typeof resource === "string")
			) {
				return;
			}
			return { resource: toAudienceClaim(resources) };
		},
		verificationOpenAPIProperties: {
			resource: {
				oneOf: [
					{ type: "string" },
					{ type: "array", items: { type: "string" } },
				],
				description:
					"The requested resource indicators, returned only to the authenticated user who owns this request",
			},
		},
	} satisfies DeviceAuthorizationGrant<
		typeof oauthDeviceRequestFields,
		{ resource: string | string[] | undefined }
	> &
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
	const grant = buildOAuthDeviceGrant();
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
