import type { GenericEndpointContext } from "@better-auth/core";
import { generateRandomString } from "better-auth/crypto";
import { getJwks } from "better-auth/oauth2";
import { signJWT } from "better-auth/plugins";
import type { Session } from "better-auth/types";
import { APIError } from "better-call";
import type { JWTPayload } from "jose";
import { compactVerify, createLocalJWKSet, decodeJwt } from "jose";
import { handleRedirect } from "./authorize";
import type { OAuthOptions, SchemaClient, Scope } from "./types";
import {
	decryptStoredClientSecret,
	getClient,
	getJwtPlugin,
	resolveSubjectIdentifier,
} from "./utils";

const BACKCHANNEL_LOGOUT_EVENT_URI =
	"http://schemas.openid.net/event/backchannel-logout";

const LOGOUT_TOKEN_JWT_TYP = "logout+jwt";

// Spec §4 recommends at most two minutes into the future to limit replay.
const LOGOUT_TOKEN_LIFETIME_SECONDS = 120;

// Short per-RP ceiling so a slow RP cannot extend a user-facing logout.
// Spec §2.5: "the OP SHOULD NOT retransmit", so a single attempt within the
// window is enough.
const BACKCHANNEL_DISPATCH_TIMEOUT_MS = 5_000;

interface TokenRow {
	id: string;
	clientId: string;
	scopes: string[];
	revoked?: Date | null;
}

/**
 * Signs a Back-Channel Logout Token per OIDC Back-Channel Logout 1.0 §2.4.
 *
 * The token reuses the ID Token signing key so any RP that validates ID Tokens
 * from this OP can validate Logout Tokens without extra configuration.
 *
 * Required because §2.4 mandates: `iss`, `aud`, `iat`, `exp`, `jti`, `events`,
 * and at least one of `sub` / `sid`. A `nonce` claim MUST NOT be present, and
 * `alg: none` is forbidden (§2.6).
 */
async function signLogoutToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	claims: {
		iss: string;
		aud: string;
		sub: string;
		sid?: string;
		iat: number;
		exp: number;
		jti: string;
	},
): Promise<string> {
	if (opts.disableJwtPlugin) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error: "server_error",
			error_description:
				"back-channel logout requires the jwt plugin (disableJwtPlugin must be false)",
		});
	}
	const jwtPluginOptions = getJwtPlugin(ctx.context)?.options;
	return signJWT(ctx, {
		options: jwtPluginOptions,
		payload: {
			...claims,
			events: {
				[BACKCHANNEL_LOGOUT_EVENT_URI]: {},
			},
		},
		header: { typ: LOGOUT_TOKEN_JWT_TYP },
	});
}

/**
 * Dispatches back-channel logout notifications per OIDC Back-Channel Logout 1.0
 * for a session (or user) whose OP session is ending. The dispatcher also
 * applies the token revocation policy from §2.7: access tokens bound to the
 * session are revoked; refresh tokens without `offline_access` are revoked;
 * `offline_access` refresh tokens are preserved so long-lived API access can
 * continue past the browser session.
 *
 * Intended to be invoked from a `session.delete.before` database hook so tokens
 * can still be enumerated by `sessionId` before the FK is nulled.
 *
 * Errors (network, slow RP, RP 4xx/5xx) are logged and swallowed; they must
 * never block a user-facing logout response.
 */
export async function dispatchBackchannelLogout(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	input: {
		sessionId?: string;
		userId: string;
	},
): Promise<void> {
	if (opts.disableJwtPlugin) return;
	const { sessionId, userId } = input;
	if (!userId) return;

	const logger = ctx.context.logger;
	try {
		const where = sessionId
			? [{ field: "sessionId", value: sessionId }]
			: [{ field: "userId", value: userId }];

		const [accessTokens, refreshTokens] = await Promise.all([
			ctx.context.adapter.findMany<TokenRow>({
				model: "oauthAccessToken",
				where,
			}),
			ctx.context.adapter.findMany<TokenRow>({
				model: "oauthRefreshToken",
				where,
			}),
		]);

		const affectedClientIds = new Set<string>();
		for (const t of accessTokens) affectedClientIds.add(t.clientId);
		for (const t of refreshTokens) affectedClientIds.add(t.clientId);
		if (affectedClientIds.size === 0) return;

		const clients = await ctx.context.adapter.findMany<SchemaClient<Scope[]>>({
			model: "oauthClient",
			where: [
				{
					field: "clientId",
					operator: "in",
					value: Array.from(affectedClientIds),
				},
			],
		});

		const targets = clients.filter((c) => {
			if (!c.backchannelLogoutUri) return false;
			if (c.disabled) return false;
			// Spec §2.2: when the RP requires `sid`, skip user-scoped dispatches.
			if (c.backchannelLogoutSessionRequired && !sessionId) return false;
			return true;
		});

		const revokedAt = new Date();
		const accessToRevoke = accessTokens.filter((t) => !t.revoked);
		const refreshToRevoke = refreshTokens.filter(
			(t) => !t.revoked && !t.scopes?.includes("offline_access"),
		);

		await Promise.allSettled([
			...accessToRevoke.map((t) =>
				ctx.context.adapter.update({
					model: "oauthAccessToken",
					where: [{ field: "id", value: t.id }],
					update: { revoked: revokedAt },
				}),
			),
			...refreshToRevoke.map((t) =>
				ctx.context.adapter.update({
					model: "oauthRefreshToken",
					where: [{ field: "id", value: t.id }],
					update: { revoked: revokedAt },
				}),
			),
		]);

		if (targets.length === 0) return;

		const jwtPluginOptions = getJwtPlugin(ctx.context)?.options;
		const iss = jwtPluginOptions?.jwt?.issuer ?? ctx.context.baseURL;
		const iat = Math.floor(Date.now() / 1000);
		const exp = iat + LOGOUT_TOKEN_LIFETIME_SECONDS;

		await Promise.allSettled(
			targets.map(async (client) => {
				const sub = await resolveSubjectIdentifier(userId, client, opts);
				const jti = generateRandomString(32, "a-z", "A-Z", "0-9");
				const token = await signLogoutToken(ctx, opts, {
					iss,
					aud: client.clientId,
					sub,
					sid: sessionId,
					iat,
					exp,
					jti,
				});
				try {
					const response = await fetch(client.backchannelLogoutUri!, {
						method: "POST",
						headers: {
							"Content-Type": "application/x-www-form-urlencoded",
							Accept: "application/json",
						},
						body: new URLSearchParams({ logout_token: token }),
						signal: AbortSignal.timeout(BACKCHANNEL_DISPATCH_TIMEOUT_MS),
						redirect: "error",
					});
					// Spec §2.8: RP MUST return 200; many frameworks normalize empty 200
					// bodies to 204, which is commonly accepted.
					if (response.status !== 200 && response.status !== 204) {
						logger.warn(
							`back-channel logout to client ${client.clientId} returned ${response.status}`,
						);
					}
				} catch (error) {
					logger.warn(
						`back-channel logout to client ${client.clientId} failed`,
						error,
					);
				}
			}),
		);
	} catch (error) {
		logger.warn("back-channel logout dispatch errored", error);
	}
}

/**
 * RP-Initiated Logout (OIDC RP-Initiated Logout 1.0). The RP presents a signed
 * `id_token_hint`; after verification, the OP terminates the matching session
 * and optionally redirects to `post_logout_redirect_uri`.
 *
 * Session termination goes through `internalAdapter.deleteSession`, which
 * fires `session.delete.before` — that hook drives back-channel notifications
 * to every other RP with tokens on the session, so the logout propagates.
 *
 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html
 */
export async function rpInitiatedLogoutEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	const {
		id_token_hint,
		client_id,
		post_logout_redirect_uri,
		state,
	}: {
		// id_token_hint is RECOMMENDED by spec; required here to prevent DoS
		id_token_hint: string;
		client_id?: string;
		post_logout_redirect_uri?: string;
		state?: string;
	} = ctx.query;

	const baseURL = ctx.context.baseURL;
	const jwtPlugin = opts.disableJwtPlugin
		? undefined
		: getJwtPlugin(ctx.context);
	const jwtPluginOptions = jwtPlugin?.options;
	const jwksUrl =
		jwtPluginOptions?.jwks?.remoteUrl ??
		`${baseURL}${jwtPluginOptions?.jwks?.jwksPath ?? "/jwks"}`;

	let clientId = client_id;
	if (!clientId) {
		let decoded: JWTPayload;
		try {
			decoded = decodeJwt(id_token_hint);
		} catch (_e) {
			throw new APIError("UNAUTHORIZED", {
				error_description: "invalid id token",
				error: "invalid_token",
			});
		}
		clientId = decoded?.aud as string | undefined;
		if (!clientId) {
			throw new APIError("INTERNAL_SERVER_ERROR", {
				error_description: "id token missing audience",
				error: "invalid_request",
			});
		}
	}

	const client = await getClient(ctx, opts, clientId);
	if (!client) {
		throw new APIError("BAD_REQUEST", {
			error_description: "client doesn't exist",
			error: "invalid_client",
		});
	}
	if (client.disabled) {
		throw new APIError("BAD_REQUEST", {
			error_description: "client is disabled",
			error: "invalid_client",
		});
	}
	if (!client.enableEndSession) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "client unable to logout",
			error: "invalid_client",
		});
	}

	let idTokenPayload: JWTPayload | undefined;
	if (opts.disableJwtPlugin) {
		const clientSecret = client.clientSecret;
		if (!clientSecret) {
			throw new APIError("UNAUTHORIZED", {
				error_description: "missing required credentials",
				error: "invalid_client",
			});
		}

		const secret = await decryptStoredClientSecret(
			ctx,
			opts.storeClientSecret,
			clientSecret,
		);
		const key = new TextEncoder().encode(secret);

		const { payload } = await compactVerify(id_token_hint, key);
		idTokenPayload = JSON.parse(new TextDecoder().decode(payload));
	} else {
		const jwks = await getJwks(id_token_hint, { jwksFetch: jwksUrl });
		const { payload } = await compactVerify(
			id_token_hint,
			createLocalJWKSet(jwks),
		);
		idTokenPayload = JSON.parse(new TextDecoder().decode(payload));
	}

	if (!idTokenPayload) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error_description: "missing payload",
			error: "invalid_request",
		});
	}

	const issuer = jwtPluginOptions?.jwt?.issuer ?? ctx.context.baseURL;
	if (issuer !== idTokenPayload.iss) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error_description: "invalid issuer",
			error: "invalid_request",
		});
	}

	const idTokenAudience =
		typeof idTokenPayload.aud === "string"
			? [idTokenPayload.aud]
			: idTokenPayload.aud;
	if (!idTokenAudience) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error_description: "id token missing audience",
			error: "invalid_request",
		});
	}
	if (client_id && !idTokenAudience.includes(client_id)) {
		throw new APIError("BAD_REQUEST", {
			error_description: "audience mismatch",
			error: "invalid_request",
		});
	}

	const sessionId = idTokenPayload.sid as string | undefined;
	if (!sessionId) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error_description: "id token missing session",
			error: "invalid_request",
		});
	}

	try {
		const session = await ctx.context.adapter.findOne<Session>({
			model: "session",
			where: [{ field: "id", value: sessionId }],
		});
		if (session?.token) {
			await ctx.context.internalAdapter.deleteSession(session.token);
		}
	} catch {
		// Session already gone; dispatch has either already fired on a prior
		// delete or there is nothing to dispatch for.
	}

	if (post_logout_redirect_uri) {
		const registeredUris = client.postLogoutRedirectUris;
		if (registeredUris?.includes(post_logout_redirect_uri)) {
			const redirectUri = new URL(post_logout_redirect_uri);
			if (state) {
				redirectUri.searchParams.set("state", state);
			}
			return handleRedirect(ctx, redirectUri.toString());
		}
	}
}
