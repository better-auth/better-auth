import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import { APIError, createAuthMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth/types";
import { extendOAuthProvider } from "./extensions";
import { resolveResourcePolicy } from "./resources";
import { getOAuthProviderApi } from "./token";
import type {
	OAuthExtensionGrantHandlerInput,
	OAuthTokenResponse,
} from "./types";
import {
	getClient,
	getOAuthProviderPlugin,
	toResourceList,
	validateClientScopes,
} from "./utils";
import { PACKAGE_VERSION } from "./version";

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

/** Path of the first-party session token endpoint this grant guards. */
const DEVICE_TOKEN_PATH = "/device/token";

/** Model name of the shared device-code table owned by `device-authorization`. */
const DEVICE_CODE_MODEL = "deviceCode";

/**
 * The subset of the `device-authorization` plugin's `deviceCode` row this grant
 * reads. Declared locally (type-only) so the oauth-provider package takes no
 * value dependency on the device-authorization plugin: at runtime the row is
 * resolved by model name through the shared adapter.
 */
interface DeviceCodeRecord {
	id: string;
	deviceCode: string;
	userId?: string | null;
	expiresAt: Date;
	status: string;
	lastPolledAt?: Date | null;
	pollingInterval?: number | null;
	clientId?: string | null;
	scope?: string | null;
	resource?: string | null;
}

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

function parseStoredResource(
	resource: string | null | undefined,
): string | string[] | undefined {
	if (!resource) return undefined;
	if (!resource.startsWith("[")) return resource;
	try {
		const parsed: unknown = JSON.parse(resource);
		if (
			Array.isArray(parsed) &&
			parsed.every((value): value is string => typeof value === "string")
		) {
			return parsed;
		}
	} catch {
		// Treat legacy/unrecognized stored values as a single resource string.
	}
	return resource;
}

async function extractFormResources(
	request: Request | undefined,
): Promise<string[] | undefined> {
	const contentType = request?.headers.get("content-type")?.toLowerCase() ?? "";
	if (!request || !contentType.includes("application/x-www-form-urlencoded")) {
		return undefined;
	}
	try {
		const params = new URLSearchParams(await request.text());
		if (!params.has("resource")) return undefined;
		return params.getAll("resource").filter(Boolean);
	} catch {
		return undefined;
	}
}

/**
 * Exchanges an approved RFC 8628 device code for an OAuth token set. Unlike the
 * device-authorization plugin's `/device/token` (which mints a first-party
 * session token), this issues a real OAuth token through the provider's shared
 * issuance: scoped, audience-bound, introspectable, with optional refresh and ID
 * tokens. The device-code row is owned by the device-authorization plugin; this
 * handler only reads and atomically consumes it.
 */
async function handleDeviceCodeGrant(
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

	const record = await ctx.context.adapter.findOne<DeviceCodeRecord>({
		model: DEVICE_CODE_MODEL,
		where: [{ field: "deviceCode", value: deviceCode }],
	});
	if (!record) {
		tokenError("BAD_REQUEST", "invalid_grant", "invalid device code");
	}

	// Confirm the caller owns this device code before any work that depends on the
	// record. Comparing the request's client_id up front returns a uniform
	// invalid_grant instead of leaking the recorded scopes: otherwise
	// authenticateClient validates those scopes against the caller's registered
	// set, and a narrower-scoped client replaying a stolen device_code would get
	// invalid_scope. The post-auth check below still covers confidential clients
	// that send client_id only in the Authorization header.
	if (
		record.clientId &&
		body?.client_id &&
		record.clientId !== body.client_id
	) {
		tokenError("BAD_REQUEST", "invalid_grant", "Client ID mismatch");
	}

	// Authenticate before validating the recorded scopes. Public clients (the
	// common device-flow shape) need only client_id; confidential clients still
	// authenticate. The grant type is bound by the dispatcher, so a client not
	// registered for the device-code grant is rejected here as unauthorized_client.
	// Scope validation is intentionally deferred until ownership is confirmed so
	// no authentication method can probe another client's requested scopes.
	const scopes = parseScopes(record.scope);
	const { client, confirmation } = await provider.authenticateClient({
		requireCredentials: false,
	});

	if (record.clientId && record.clientId !== client.clientId) {
		tokenError("BAD_REQUEST", "invalid_grant", "Client ID mismatch");
	}
	validateClientScopes(client, scopes);

	// RFC 8628 §3.5 slow_down: reject polls faster than the advertised interval.
	if (record.lastPolledAt && record.pollingInterval) {
		const elapsed = Date.now() - new Date(record.lastPolledAt).getTime();
		if (elapsed < record.pollingInterval) {
			tokenError("BAD_REQUEST", "slow_down", "Polling too frequently");
		}
	}
	await ctx.context.adapter.update({
		model: DEVICE_CODE_MODEL,
		where: [{ field: "id", value: record.id }],
		update: { lastPolledAt: new Date() },
	});

	if (new Date(record.expiresAt) < new Date()) {
		await ctx.context.adapter.delete({
			model: DEVICE_CODE_MODEL,
			where: [{ field: "id", value: record.id }],
		});
		tokenError("BAD_REQUEST", "expired_token", "Device code has expired");
	}

	if (record.status === "pending") {
		tokenError(
			"BAD_REQUEST",
			"authorization_pending",
			"Authorization request is still pending",
		);
	}

	if (record.status === "denied") {
		await ctx.context.adapter.delete({
			model: DEVICE_CODE_MODEL,
			where: [{ field: "id", value: record.id }],
		});
		tokenError(
			"BAD_REQUEST",
			"access_denied",
			"Authorization request was denied",
		);
	}

	if (record.status === "approved" && record.userId) {
		const requestedResources = toResourceList(body?.resource);
		const boundResources = toResourceList(parseStoredResource(record.resource));
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
		// Validate the bound resource policy before the approved code is consumed.
		// Token issuance validates it again while applying its TTL, signing, and
		// claims policy, but an invalid request must not burn a one-time device code.
		await resolveResourcePolicy(ctx, input.opts, {
			resource: resources,
			clientId: client.clientId,
			requestedScopes: scopes,
		});

		// Atomically claim the approved code as the single race gate, mirroring the
		// device-authorization session flow: concurrent polls contend on this
		// delete-and-return and only the caller that removes the row issues tokens.
		const claimed = await ctx.context.adapter.consumeOne<DeviceCodeRecord>({
			model: DEVICE_CODE_MODEL,
			where: [
				{ field: "id", value: record.id },
				{ field: "clientId", value: client.clientId },
				{ field: "status", value: "approved" },
			],
		});
		if (!claimed?.userId) {
			tokenError("BAD_REQUEST", "invalid_grant", "invalid device code");
		}

		const user = await ctx.context.internalAdapter.findUserById(claimed.userId);
		if (!user) {
			tokenError(
				"INTERNAL_SERVER_ERROR",
				"server_error",
				"User not found for approved device code",
			);
		}

		return provider.issueTokens({
			client,
			scopes,
			user,
			resources,
			// Forward a sender-constraint a confidential client-auth strategy proved.
			confirmation,
		});
	}

	tokenError(
		"INTERNAL_SERVER_ERROR",
		"server_error",
		"invalid device code status",
	);
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
 * First-party device login (the device-authorization plugin's own
 * `/device/token`, which mints a Better Auth session token) keeps working
 * unchanged. To stop a registered OAuth client's device code from being redeemed
 * there for a session token, a `before` hook rejects `/device/token` requests
 * whose `client_id` resolves to a registered OAuth client, directing them to
 * `/oauth2/token`.
 *
 * @example
 * ```ts
 * const auth = betterAuth({
 *   plugins: [
 *     deviceAuthorization(),
 *     oauthProvider({ ...  }),
 *     deviceCodeGrant(),
 *   ],
 * });
 * ```
 */
export function deviceCodeGrant(): BetterAuthPlugin {
	return {
		id: "oauth-provider-device-code",
		version: PACKAGE_VERSION,
		init: (ctx: AuthContext) => {
			if (!ctx.getPlugin("device-authorization")) {
				throw new BetterAuthError(
					"deviceCodeGrant requires the device-authorization plugin.",
				);
			}
			const provider = ctx.getPlugin("oauth-provider");
			if (!provider) {
				throw new BetterAuthError(
					"deviceCodeGrant requires the oauth-provider plugin.",
				);
			}
			extendOAuthProvider(ctx, {
				grants: {
					[DEVICE_CODE_GRANT_TYPE]: handleDeviceCodeGrant,
				},
				metadata: (metadataInput) => ({
					device_authorization_endpoint: `${metadataInput.ctx.context.baseURL}${DEVICE_AUTHORIZATION_PATH}`,
				}),
			});
		},
		hooks: {
			before: [
				{
					matcher(ctx) {
						return ctx.path === DEVICE_AUTHORIZATION_PATH;
					},
					handler: createAuthMiddleware(async (ctx) => {
						const body = ctx.body as
							| {
									client_id?: string;
									scope?: string;
									resource?: string | string[];
							  }
							| undefined;
						if (!body?.client_id) return;
						const formResources = await extractFormResources(ctx.request);
						if (formResources) {
							body.resource =
								formResources.length === 1 ? formResources[0] : formResources;
						}
						const provider = getOAuthProviderPlugin(ctx.context);
						if (!provider) return;
						const endpointCtx = ctx as GenericEndpointContext;
						const oauthClient = await getClient(
							endpointCtx,
							provider.options,
							body.client_id,
						);
						// Unknown ids belong to the device-authorization plugin's existing
						// first-party flow. Registered OAuth clients are authenticated and
						// authorized before their request is shown to the user.
						if (!oauthClient) return;
						const scopes = parseScopes(body.scope);
						if (body.scope !== undefined) {
							body.scope = scopes.join(" ");
						}
						const api = getOAuthProviderApi(
							endpointCtx,
							provider.options,
							DEVICE_CODE_GRANT_TYPE,
						);
						const authenticated = await api.authenticateClient({
							scopes,
							requireCredentials: false,
						});
						if (authenticated.clientId !== body.client_id) {
							tokenError("BAD_REQUEST", "invalid_grant", "Client ID mismatch");
						}
						await resolveResourcePolicy(endpointCtx, provider.options, {
							resource: body.resource,
							clientId: authenticated.clientId,
							requestedScopes: scopes,
						});
					}),
				},
				{
					matcher(ctx) {
						return ctx.path === DEVICE_TOKEN_PATH;
					},
					handler: createAuthMiddleware(async (ctx) => {
						const clientId = (ctx.body as { client_id?: string } | undefined)
							?.client_id;
						if (!clientId) return;
						const provider = getOAuthProviderPlugin(ctx.context);
						if (!provider) return;
						// A device code minted for a registered OAuth client must yield an
						// OAuth token at /oauth2/token, never a first-party session token
						// here. Public/first-party client ids resolve to null and pass.
						const oauthClient = await getClient(
							ctx as GenericEndpointContext,
							provider.options,
							clientId,
						);
						if (oauthClient) {
							throw new APIError("BAD_REQUEST", {
								error: "invalid_grant",
								error_description:
									"This client is a registered OAuth client. Exchange the device code at the OAuth token endpoint (/oauth2/token).",
							});
						}
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
}
