import type { GenericEndpointContext } from "@better-auth/core";
import { isBrowserFetchRequest } from "@better-auth/core/utils/fetch-metadata";
import { generateRandomString } from "better-auth/crypto";
import { getJwks } from "better-auth/oauth2";
import { resolveSigningKey, signJWT } from "better-auth/plugins";
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

// OIDC Front-Channel Logout 1.0 gives no normative timeout for the iframe
// fan-out; 3 seconds keeps a hung RP iframe from stalling the user-facing
// redirect while still letting typical logout endpoints complete.
const FRONTCHANNEL_IFRAME_TIMEOUT_MS = 3_000;

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
 * consumes this plan and POSTs one Logout Token per target. `sessionId` is
 * always present because every session-end path that reaches here carries the
 * id of the session being terminated.
 */
interface BackchannelLogoutPlan {
	sessionId: string;
	targets: BackchannelLogoutTarget[];
}

/**
 * Signs a Back-Channel Logout Token per OIDC Back-Channel Logout 1.0 §2.4.
 *
 * The token reuses the ID Token signing key so any RP that validates ID Tokens
 * from this OP can validate Logout Tokens without extra configuration. The
 * caller resolves that key once and passes it in so a fan-out to many RPs does
 * not re-read it per target.
 *
 * §2.4 mandates `iss`, `aud`, `iat`, `exp`, `jti`, `events`, and at least one
 * of `sub` / `sid` (we send both). A `nonce` claim MUST NOT be present, and
 * `alg: none` is forbidden (§2.6).
 */
async function signLogoutToken(
	ctx: GenericEndpointContext,
	options: Parameters<typeof signJWT>[1]["options"],
	resolvedKey: Awaited<ReturnType<typeof resolveSigningKey>>,
	claims: {
		iss: string;
		aud: string;
		sub: string;
		sid: string;
		iat: number;
		exp: number;
		jti: string;
	},
): Promise<string> {
	return signJWT(ctx, {
		options,
		payload: {
			...claims,
			events: {
				[BACKCHANNEL_LOGOUT_EVENT_URI]: {},
			},
		},
		header: { typ: LOGOUT_TOKEN_JWT_TYP },
		resolvedKey: resolvedKey ?? undefined,
	});
}

/**
 * Synchronous phase: enumerate tokens for the session being terminated, revoke
 * them, and return a plan for the asynchronous delivery phase. Runs inline in
 * the `session.delete.before` hook so the DB state is consistent before the
 * session row disappears.
 *
 * Revocation is the stored backstop, not the primary enforcement: introspection
 * and `/userinfo` already treat a token whose session has ended as inactive
 * (see `validateOpaqueAccessToken` / `validateJwtAccessToken`), so a missed
 * `revoked` write cannot keep a session-bound token alive on its own. Access
 * tokens bound to the session are revoked as OP hardening. Refresh tokens
 * follow OIDC Back-Channel Logout 1.0 §2.7: those without `offline_access` are
 * revoked; `offline_access` refresh tokens survive so long-lived API access can
 * outlive the browser session.
 *
 * Revocation runs regardless of the JWT plugin (refresh-token revocation has no
 * dependency on signing). Only the Logout Token delivery plan needs the JWT
 * plugin, so when it is disabled we still revoke but never build a plan.
 *
 * Returns `null` when there is nothing to do, so the caller can skip the
 * background handoff entirely.
 */
async function revokeAndPlanBackchannelLogout(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	input: { sessionId: string; userId: string },
): Promise<BackchannelLogoutPlan | null> {
	const { sessionId, userId } = input;
	if (!userId) return null;

	const logger = ctx.context.logger;
	try {
		const where = [{ field: "sessionId", value: sessionId }];

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

		// Access tokens are always revoked (OP hardening). Refresh tokens follow
		// §2.7: revoke unless `offline_access` was granted. The non-offline_access
		// branch is reachable via refresh-token scope narrowing, so it must stay.
		const revokedAt = new Date();
		const accessToRevokeIds = accessTokens
			.filter((t) => !t.revoked)
			.map((t) => t.id);
		const refreshToRevokeIds = refreshTokens
			.filter((t) => !t.revoked && !t.scopes?.includes("offline_access"))
			.map((t) => t.id);

		const revocations = await Promise.allSettled([
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
		// Surface a failed revocation write at error level. Dispatch still
		// proceeds (RP notification is independent and the session-liveness
		// checks in introspection remain authoritative), but operators need a
		// signal that the stored `revoked` backstop drifted from session state.
		for (const result of revocations) {
			if (result.status === "rejected") {
				logger.error(
					"back-channel logout: token revocation update failed",
					result.reason,
				);
			}
		}

		// Logout Tokens are signed through the JWT plugin's JWKS, so skip the
		// delivery plan when it is disabled. Registration already rejects
		// `backchannel_logout_uri` in that mode; this also guards stale clients.
		const eligibleClients = opts.disableJwtPlugin
			? []
			: clients.filter((c) => Boolean(c.backchannelLogoutUri) && !c.disabled);
		if (eligibleClients.length === 0) return null;

		const targets: BackchannelLogoutTarget[] = await Promise.all(
			eligibleClients.map(async (client) => ({
				client,
				sub: await resolveSubjectIdentifier(userId, client, opts),
			})),
		);

		return { sessionId, targets };
	} catch (error) {
		logger.error("back-channel logout revocation failed", error);
		return null;
	}
}

/**
 * Asynchronous phase: sign one Logout Token per target client and POST it to
 * the registered `backchannel_logout_uri`. The caller hands this to
 * `runInBackgroundOrAwait`, so when a background handler is configured (Vercel
 * `waitUntil`, Cloudflare `ctx.waitUntil`) it runs after the response; without
 * one it completes inline so delivery is not lost on request teardown.
 *
 * Spec §2.5: "the OP SHOULD NOT retransmit", so each RP gets a single attempt
 * within `BACKCHANNEL_DISPATCH_TIMEOUT_MS`. Every per-client failure (fetch
 * error, non-2xx response, signing error, subject resolution error) is
 * logged; none of them can reject the outer promise.
 */
async function deliverBackchannelLogoutTokens(
	ctx: GenericEndpointContext,
	plan: BackchannelLogoutPlan,
): Promise<void> {
	const logger = ctx.context.logger;
	const jwtPluginOptions = getJwtPlugin(ctx.context)?.options;
	const iss = jwtPluginOptions?.jwt?.issuer ?? ctx.context.baseURL;
	const iat = Math.floor(Date.now() / 1000);
	const exp = iat + LOGOUT_TOKEN_LIFETIME_SECONDS;
	// Resolve the signing key once and reuse it for every RP target. A custom
	// remote signer (`jwt.sign`) owns its own key material, so skip resolution.
	const resolvedKey = jwtPluginOptions?.jwt?.sign
		? null
		: await resolveSigningKey(ctx, jwtPluginOptions);

	await Promise.allSettled(
		plan.targets.map(async ({ client, sub }) => {
			try {
				const jti = generateRandomString(32, "a-z", "A-Z", "0-9");
				const token = await signLogoutToken(
					ctx,
					jwtPluginOptions,
					resolvedKey,
					{
						iss,
						aud: client.clientId,
						sub,
						sid: plan.sessionId,
						iat,
						exp,
						jti,
					},
				);
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

export { revokeAndPlanBackchannelLogout, deliverBackchannelLogoutTokens };

/** Escapes a string for safe interpolation into an HTML attribute value. */
function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

/**
 * Enumerates clients holding tokens on the session being terminated that have
 * registered a `frontchannel_logout_uri`, and builds the iframe URL for each.
 * Must run before the session row is deleted: token rows reference the
 * session with `onDelete: "set null"`, so the linkage disappears with the
 * row.
 *
 * Per OIDC Front-Channel Logout 1.0 §2, when a client registered
 * `frontchannel_logout_session_required: true` the OP appends `iss` and `sid`
 * query parameters (if either is included, both MUST be).
 *
 * Returns `null` when no client opted in, so the endpoint keeps the
 * pre-existing immediate-redirect behavior. Enumeration failures are logged
 * and treated as "no targets" — front-channel notification is best-effort and
 * must not block the user-facing logout.
 */
async function planFrontchannelLogout(
	ctx: GenericEndpointContext,
	input: { sessionId: string; issuer: string },
): Promise<string[] | null> {
	const logger = ctx.context.logger;
	try {
		const where = [{ field: "sessionId", value: input.sessionId }];

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

		const urls = clients
			.filter((c) => Boolean(c.frontchannelLogoutUri) && !c.disabled)
			.map((client) => {
				const url = new URL(client.frontchannelLogoutUri!);
				if (client.frontchannelLogoutSessionRequired) {
					url.searchParams.set("iss", input.issuer);
					url.searchParams.set("sid", input.sessionId);
				}
				return url.toString();
			});
		return urls.length > 0 ? urls : null;
	} catch (error) {
		logger.error("front-channel logout enumeration failed", error);
		return null;
	}
}

/**
 * Renders the OIDC Front-Channel Logout 1.0 §3 logout page: one hidden iframe
 * per front-channel RP, plus an inline script that redirects to the validated
 * `post_logout_redirect_uri` once every iframe has settled (or after
 * `FRONTCHANNEL_IFRAME_TIMEOUT_MS`, so a hung RP cannot stall the user). The
 * iframes are plain HTML and fire without JavaScript; a meta-refresh covers
 * the redirect when scripting is disabled.
 */
function renderFrontchannelLogoutPage(input: {
	urls: string[];
	redirectUri?: string;
}): string {
	const iframes = input.urls
		.map(
			(url) =>
				`<iframe src="${escapeHtml(url)}" width="0" height="0" style="display:none" aria-hidden="true"></iframe>`,
		)
		.join("\n\t\t");
	// `<` is additionally escaped so the URL can never break out of the inline
	// <script> context (e.g. via a crafted `</script>` path segment).
	const redirectTo = input.redirectUri
		? JSON.stringify(input.redirectUri).replaceAll("<", "\\u003c")
		: "null";
	const metaRefresh = input.redirectUri
		? `\n\t\t<meta http-equiv="refresh" content="${Math.ceil(FRONTCHANNEL_IFRAME_TIMEOUT_MS / 1000) + 2};url=${escapeHtml(input.redirectUri)}">`
		: "";
	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8">
		<meta name="robots" content="noindex">${metaRefresh}
		<title>Signing out</title>
	</head>
	<body>
		<p>Signing out&hellip;</p>
		${iframes}
		<script>
			(function () {
				var redirectTo = ${redirectTo};
				var frames = document.querySelectorAll("iframe");
				var pending = frames.length;
				var finished = false;
				function finish() {
					if (finished) return;
					finished = true;
					if (redirectTo) window.location.replace(redirectTo);
				}
				function settle() {
					pending -= 1;
					if (pending <= 0) finish();
				}
				for (var i = 0; i < frames.length; i++) {
					frames[i].addEventListener("load", settle);
					frames[i].addEventListener("error", settle);
				}
				setTimeout(finish, ${FRONTCHANNEL_IFRAME_TIMEOUT_MS});
			})();
		</script>
	</body>
</html>`;
}

/**
 * RP-Initiated Logout (OIDC RP-Initiated Logout 1.0). The RP presents a signed
 * `id_token_hint`; after verification, the OP terminates the matching session
 * and optionally redirects to `post_logout_redirect_uri`.
 *
 * Session termination goes through `internalAdapter.deleteSession`, which fires
 * `session.delete.before` so the hook drives revocation and back-channel
 * notifications to every RP with tokens on the session.
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

	// Front-channel logout needs a browser to render the iframe fan-out, so it
	// only applies to navigation requests; fetch-style requests (SPA clients)
	// keep the JSON contract. Mirrors the channel selection in
	// `handleRedirect`. Enumeration must also happen before the session row is
	// deleted, because token rows reference it with `onDelete: "set null"`.
	const isNavigationRequest = !(
		isBrowserFetchRequest(ctx.request?.headers) ||
		ctx.headers?.get("accept")?.includes("application/json")
	);
	const frontchannelUrls = isNavigationRequest
		? await planFrontchannelLogout(ctx, { sessionId, issuer })
		: null;

	try {
		const session = await ctx.context.adapter.findOne<Session>({
			model: "session",
			where: [{ field: "id", value: sessionId }],
		});
		if (session?.token) {
			// internalAdapter.deleteSession fires `session.delete.before`, which
			// runs revocation and back-channel dispatch for every RP on this
			// session.
			await ctx.context.internalAdapter.deleteSession(session.token);
		} else if (session) {
			// A persisted session always carries a token; this only guards a
			// corrupted row by removing it directly (best effort).
			await ctx.context.adapter.delete<Session>({
				model: "session",
				where: [{ field: "id", value: session.id }],
			});
		}
	} catch {
		// Session already gone; nothing further to do.
	}

	// Resolve the post-logout redirect once; it feeds the immediate redirect
	// and, when front-channel clients are present, the logout page's deferred
	// redirect. Unregistered URIs are dropped (no need to fail).
	let postLogoutRedirect: string | undefined;
	if (post_logout_redirect_uri) {
		const registeredUris = client.postLogoutRedirectUris;
		if (registeredUris?.includes(post_logout_redirect_uri)) {
			const redirectUri = new URL(post_logout_redirect_uri);
			if (state) {
				redirectUri.searchParams.set("state", state);
			}
			postLogoutRedirect = redirectUri.toString();
		}
	}

	if (frontchannelUrls) {
		// Spec §3: the session is already terminated; render one hidden iframe
		// per RP and redirect (when validated) after they settle.
		return new Response(
			renderFrontchannelLogoutPage({
				urls: frontchannelUrls,
				redirectUri: postLogoutRedirect,
			}),
			{
				headers: {
					"Content-Type": "text/html",
					// Per-session content; also keeps id_token_hint-bearing URLs out
					// of shared caches.
					"Cache-Control": "no-store",
					// The page embeds RP iframes; never leak the id_token_hint-bearing
					// page URL to them via Referer.
					"Referrer-Policy": "no-referrer",
				},
			},
		);
	}

	if (postLogoutRedirect) {
		return handleRedirect(ctx, postLogoutRedirect);
	}
}
