import { BetterAuthError } from "@better-auth/core/error";
import { APIError } from "better-auth/api";
import type { DeviceAuthorizationGrant } from "better-auth/plugins/device-authorization";
import { redeemDeviceCode } from "better-auth/plugins/device-authorization";
import * as z from "zod";
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
]);

const deviceCodeGrantRequestFields = {
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

/**
 * Bridges the {@link https://datatracker.ietf.org/doc/html/rfc8628 RFC 8628}
 * device authorization grant into the OAuth Provider. Pair it with the
 * `device-authorization` plugin (which owns the `/device/code` request endpoint,
 * the user verification flow, and the `deviceCode` table) and the
 * `oauthProvider` plugin: this registers a `device_code` token grant on
 * `/oauth2/token` that issues real OAuth tokens for a registered OAuth client,
 * and advertises `device_authorization_endpoint` in discovery metadata.
 *
 * First-party device login continues to use `/device/token` for Better Auth
 * session tokens. OAuth-owned codes persist an immutable client binding, so
 * they can only be claimed at `/oauth2/token`, even if the client registry later
 * changes.
 *
 * @example
 * ```ts
 * const grant = deviceCodeGrant();
 * const auth = betterAuth({
 *   plugins: [
 *     deviceAuthorization({ grant }),
 *     oauthProvider({ extensions: [grant], ...  }),
 *   ],
 * });
 * ```
 */
export function deviceCodeGrant() {
	const grant = {
		requestSchemaFields: deviceCodeGrantRequestFields,
		requestErrorCodes: ["invalid_target"] as const,
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
		assertConfiguration: (ctx) => {
			const provider = ctx.getPlugin("oauth-provider");
			if (!provider) {
				throw new BetterAuthError(
					"deviceCodeGrant requires the oauth-provider plugin.",
				);
			}
			if (!provider.options.extensions?.includes(grant)) {
				throw new BetterAuthError(
					"deviceCodeGrant must be passed to oauthProvider({ extensions: [grant] }) as well as deviceAuthorization({ grant }).",
				);
			}
			const deviceAuthorizationPlugin = ctx.getPlugin("device-authorization");
			if (deviceAuthorizationPlugin?.options.grant !== grant) {
				throw new BetterAuthError(
					"deviceCodeGrant must be passed to deviceAuthorization({ grant }) as well as oauthProvider({ extensions: [grant] }).",
				);
			}
		},
		grants: {
			[DEVICE_CODE_GRANT_TYPE]: exchangeOAuthDeviceCode,
		},
		metadata: (metadataInput) => ({
			device_authorization_endpoint: `${metadataInput.ctx.context.baseURL}${DEVICE_AUTHORIZATION_PATH}`,
		}),
		authorizeRequest: async ({ ctx, request }) => {
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
			const oauthClient = await getClient(
				ctx,
				provider.options,
				request.client_id,
			);
			// Requests from unknown ids remain in the standalone session flow.
			if (!oauthClient) return;
			const scopes = parseScopes(request.scope);
			if (request.scope !== undefined) {
				request.scope = scopes.join(" ");
			}
			const api = getOAuthProviderApi(
				ctx,
				provider.options,
				DEVICE_CODE_GRANT_TYPE,
			);
			const authenticated = await api.authenticateClient({
				scopes,
				requireCredentials: false,
			});
			if (authenticated.clientId !== request.client_id) {
				tokenError("BAD_REQUEST", "invalid_grant", "Client ID mismatch");
			}
			await resolveResourcePolicy(ctx, provider.options, {
				resource: request.resource,
				clientId: authenticated.clientId,
				requestedScopes: scopes,
			});
			return {
				oauthClientId: authenticated.clientId,
				resources: toResourceList(request.resource) ?? null,
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
		typeof deviceCodeGrantRequestFields,
		{ resource: string | string[] | undefined }
	> &
		OAuthProviderExtension;
	return grant;
}

/** The shared Device Authorization and OAuth Provider extension contract. */
export type DeviceCodeGrant = ReturnType<typeof deviceCodeGrant>;
