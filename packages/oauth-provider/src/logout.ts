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
 * A client with a registered `backchannel_logout_uri` whose session is being
 * terminated. Carries everything the async delivery phase needs so the caller
 * can fire it into the background without a second DB read.
 */
interface BackchannelLogoutTarget {
	client: SchemaClient<Scope[]>;
	sub: string;
}

/**
 * Plan produced by the synchronous revocation phase. The delivery phase
 * consumes this plan and POSTs one Logout Token per target.
 */
interface BackchannelLogoutPlan {
	sessionId?: string;
	targets: BackchannelLogoutTarget[];
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
 * Synchronous phase: enumerate tokens for the session being terminated, apply
 * the spec §2.7 revocation policy, and return a plan for the asynchronous
 * delivery phase. Runs inline in the `session.delete.before` hook so the DB
 * state is consistent with the hook's promise (session gone → tokens revoked)
 * before the session row disappears.
 *
 * Access tokens bound to the session are revoked; refresh tokens without
 * `offline_access` are revoked; `offline_access` refresh tokens are preserved
 * so long-lived API access can survive the browser session.
 *
 * Returns `null` when there is nothing to do, so the caller can skip the
 * background handoff entirely.
 */
async function revokeAndPlanBackchannelLogout(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	input: { sessionId?: string; userId: string },
): Promise<BackchannelLogoutPlan | null> {
	if (opts.disableJwtPlugin) return null;
	const { sessionId, userId } = input;
	if (!userId) return null;

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
		if (affectedClientIds.size === 0) return null;

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

		// Spec §2.7: access tokens are always revoked; refresh tokens without
		// `offline_access` are revoked; `offline_access` refresh tokens survive.
		const revokedAt = new Date();
		const accessToRevokeIds = accessTokens
			.filter((t) => !t.revoked)
			.map((t) => t.id);
		const refreshToRevokeIds = refreshTokens
			.filter((t) => !t.revoked && !t.scopes?.includes("offline_access"))
			.map((t) => t.id);

		await Promise.allSettled([
			accessToRevokeIds.length > 0
				? ctx.context.adapter.updateMany({
						model: "oauthAccessToken",
						where: [{ field: "id", operator: "in", value: accessToRevokeIds }],
						update: { revoked: revokedAt },
					})
				: Promise.resolve(),
			refreshToRevokeIds.length > 0
				? ctx.context.adapter.updateMany({
						model: "oauthRefreshToken",
						where: [{ field: "id", operator: "in", value: refreshToRevokeIds }],
						update: { revoked: revokedAt },
					})
				: Promise.resolve(),
		]);

		const eligibleClients = clients.filter((c) => {
			if (!c.backchannelLogoutUri) return false;
			if (c.disabled) return false;
			// Spec §2.2: when the RP requires `sid`, skip user-scoped dispatches.
			if (c.backchannelLogoutSessionRequired && !sessionId) return false;
			return true;
		});
		if (eligibleClients.length === 0) return null;

		const targets: BackchannelLogoutTarget[] = await Promise.all(
			eligibleClients.map(async (client) => ({
				client,
				sub: await resolveSubjectIdentifier(userId, client, opts),
			})),
		);

		return { sessionId, targets };
	} catch (error) {
		logger.warn("back-channel logout revocation failed", error);
		return null;
	}
}

/**
 * Asynchronous phase: sign one Logout Token per target client and POST it to
 * the registered `backchannel_logout_uri`. Runs inside the host's background
 * task handler (e.g. Vercel `waitUntil`, Cloudflare `ctx.waitUntil`) so a
 * slow or unreachable RP cannot delay the user-facing logout response.
 *
 * Spec §2.5: "the OP SHOULD NOT retransmit", so each RP gets a single attempt
 * within `BACKCHANNEL_DISPATCH_TIMEOUT_MS`. Every per-client failure (fetch
 * error, non-2xx response, signing error, subject resolution error) is
 * logged; none of them can reject the outer promise.
 */
async function deliverBackchannelLogoutTokens(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	plan: BackchannelLogoutPlan,
): Promise<void> {
	const logger = ctx.context.logger;
	const jwtPluginOptions = getJwtPlugin(ctx.context)?.options;
	const iss = jwtPluginOptions?.jwt?.issuer ?? ctx.context.baseURL;
	const iat = Math.floor(Date.now() / 1000);
	const exp = iat + LOGOUT_TOKEN_LIFETIME_SECONDS;

	await Promise.allSettled(
		plan.targets.map(async ({ client, sub }) => {
			try {
				const jti = generateRandomString(32, "a-z", "A-Z", "0-9");
				const token = await signLogoutToken(ctx, opts, {
					iss,
					aud: client.clientId,
					sub,
					sid: plan.sessionId,
					iat,
					exp,
					jti,
				});
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
}

/**
 * Runs the full back-channel logout sequence inline. Used by code paths that
 * cannot rely on the `session.delete.before` hook firing (e.g. the
 * RP-Initiated Logout fallback when the session row lacks a usable token).
 *
 * Prefer the split `revokeAndPlan` + `deliver` flow elsewhere so the HTTP
 * fan-out is routed through the host's background handler.
 */
async function dispatchBackchannelLogout(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	input: { sessionId?: string; userId: string },
): Promise<void> {
	const plan = await revokeAndPlanBackchannelLogout(ctx, opts, input);
	if (!plan) return;
	await deliverBackchannelLogoutTokens(ctx, opts, plan);
}

export { revokeAndPlanBackchannelLogout, deliverBackchannelLogoutTokens };

/**
 * RP-Initiated Logout (OIDC RP-Initiated Logout 1.0). The RP presents a signed
 * `id_token_hint`; after verification, the OP terminates the matching session
 * and optionally redirects to `post_logout_redirect_uri`.
 *
 * Session termination goes through `internalAdapter.deleteSession`, which
 * fires `session.delete.before` so the hook drives back-channel notifications
 * to every other RP with tokens on the session. If the session row lacks a
 * `token` (malformed or legacy data), we fall back to deleting by id and
 * firing the dispatcher inline so the logout still propagates.
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
			// Happy path: goes through internalAdapter so the session-delete hook
			// runs back-channel dispatch for us.
			await ctx.context.internalAdapter.deleteSession(session.token);
		} else if (session?.id) {
			// Malformed or legacy row with no `token`: delete directly and fire
			// the dispatcher inline so the logout still propagates.
			ctx.context.logger.warn(
				`rp-initiated logout: session ${session.id} has no token; dispatching back-channel logout inline`,
			);
			await ctx.context.adapter.delete<Session>({
				model: "session",
				where: [{ field: "id", value: session.id }],
			});
			await dispatchBackchannelLogout(ctx, opts, {
				sessionId: session.id,
				userId: (idTokenPayload.sub as string | undefined) ?? "",
			});
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
