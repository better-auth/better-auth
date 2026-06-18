import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import { APIError, createAuthMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth/types";
import { extendOAuthProvider } from "./extensions";
import type {
	OAuthExtensionGrantHandlerInput,
	OAuthOptions,
	OAuthTokenResponse,
	Scope,
} from "./types";
import { getClient, toResourceList } from "./utils";
import { PACKAGE_VERSION } from "./version";

/**
 * RFC 8628 device authorization grant type. A registered OAuth client polls the
 * token endpoint with this `grant_type` to exchange an approved device code for
 * a first-class OAuth token set.
 */
export const DEVICE_CODE_GRANT_TYPE =
	"urn:ietf:params:oauth:grant-type:device_code";

/**
 * Default path of the device authorization request endpoint contributed by the
 * `device-authorization` plugin, advertised as `device_authorization_endpoint`
 * in the provider's discovery metadata.
 */
const DEFAULT_DEVICE_AUTHORIZATION_PATH = "/device/code";

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
}

export interface DeviceCodeGrantOptions {
	/**
	 * Path of the device authorization request endpoint to advertise as
	 * `device_authorization_endpoint`. Defaults to the `device-authorization`
	 * plugin's `/device/code`.
	 */
	deviceAuthorizationPath?: string;
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
	const deviceCode = (ctx.body as { device_code?: string } | undefined)
		?.device_code;
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

	// Authenticate the polling client against the scopes captured at the device
	// authorization request. Public clients (the common device-flow shape) need
	// only client_id; confidential clients still authenticate. The grant type is
	// bound by the dispatcher, so a client not registered for the device-code
	// grant is rejected here as unauthorized_client.
	const scopes = record.scope ? record.scope.split(" ") : [];
	const { client, confirmation } = await provider.authenticateClient({
		scopes,
		requireCredentials: false,
	});

	if (record.clientId && record.clientId !== client.clientId) {
		tokenError("BAD_REQUEST", "invalid_grant", "Client ID mismatch");
	}

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

		const resources = toResourceList(
			(ctx.body as { resource?: string | string[] } | undefined)?.resource,
		);
		return provider.issueTokens({
			client,
			scopes: claimed.scope ? claimed.scope.split(" ") : [],
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
export function deviceCodeGrant(
	options: DeviceCodeGrantOptions = {},
): BetterAuthPlugin {
	const deviceAuthorizationPath =
		options.deviceAuthorizationPath ?? DEFAULT_DEVICE_AUTHORIZATION_PATH;
	// Captured at init (the oauth-provider options object is mutated in place by
	// extendOAuthProvider, so the reference stays current) and read by the
	// /device/token guard to resolve registered OAuth clients.
	let oauthOptions: OAuthOptions<Scope[]> | undefined;

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
			oauthOptions = provider.options as OAuthOptions<Scope[]>;
			extendOAuthProvider(ctx, {
				grants: {
					[DEVICE_CODE_GRANT_TYPE]: handleDeviceCodeGrant,
				},
				metadata: (metadataInput) => ({
					device_authorization_endpoint: `${metadataInput.ctx.context.baseURL}${deviceAuthorizationPath}`,
				}),
			});
		},
		hooks: {
			before: [
				{
					matcher(ctx) {
						return ctx.path === DEVICE_TOKEN_PATH;
					},
					handler: createAuthMiddleware(async (ctx) => {
						if (!oauthOptions) return;
						const clientId = (ctx.body as { client_id?: string } | undefined)
							?.client_id;
						if (!clientId) return;
						// A device code minted for a registered OAuth client must yield an
						// OAuth token at /oauth2/token, never a first-party session token
						// here. Public/first-party client ids resolve to null and pass.
						const oauthClient = await getClient(
							ctx as GenericEndpointContext,
							oauthOptions,
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
