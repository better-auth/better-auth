import type { GenericEndpointContext } from "@better-auth/core";
import { getCurrentAdapter } from "@better-auth/core/context";
import { isBrowserFetchRequest } from "@better-auth/core/utils/fetch-metadata";
import { deleteSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { getJwks } from "better-auth/oauth2";
import { resolveSigningKey, signJWT } from "better-auth/plugins";
import type { Session } from "better-auth/types";
import { APIError } from "better-call";
import type { JWTPayload } from "jose";
import { compactVerify, createLocalJWKSet, decodeJwt } from "jose";
import type { OAuthRedirectResult } from "./authorize";
import { getIssuer, handleRedirect } from "./authorize";
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
 * consumes this plan and POSTs one Logout Token per target. `sessionId` is
 * always present because every session-end path that reaches here carries the
 * id of the session being terminated.
 */
export interface BackchannelLogoutPlan {
	accessTokenIds: string[];
	refreshTokenIds: string[];
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
 * Build the immutable work plan before a session is deleted. This phase only
 * reads database state because a later delete hook may still veto the mutation.
 * Token identifiers must be captured here because their `sessionId` foreign key
 * is cleared when the session row disappears.
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
 * Token revocation runs regardless of the JWT plugin (refresh-token revocation
 * has no dependency on signing). Only Logout Token delivery needs the JWT
 * plugin, so a plan may contain token identifiers with no delivery targets.
 *
 * Returns `null` when there is nothing to do, so the caller can skip the
 * background handoff entirely.
 */
async function prepareBackchannelLogoutPlan(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	input: { sessionId: string; userId: string },
): Promise<BackchannelLogoutPlan | null> {
	const { sessionId, userId } = input;
	if (!userId) return null;

	const logger = ctx.context.logger;
	try {
		const adapter = await getCurrentAdapter(ctx.context.adapter);
		const where = [{ field: "sessionId", value: sessionId }];

		const [accessTokens, refreshTokens] = await Promise.all([
			adapter.findMany<TokenRow>({
				model: "oauthAccessToken",
				where,
			}),
			adapter.findMany<TokenRow>({
				model: "oauthRefreshToken",
				where,
			}),
		]);

		const affectedClientIds = new Set<string>();
		for (const t of accessTokens) affectedClientIds.add(t.clientId);
		for (const t of refreshTokens) affectedClientIds.add(t.clientId);
		if (affectedClientIds.size === 0) return null;

		const clients = await adapter.findMany<SchemaClient<Scope[]>>({
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
		const accessToRevokeIds = accessTokens
			.filter((t) => !t.revoked)
			.map((t) => t.id);
		const refreshToRevokeIds = refreshTokens
			.filter((t) => !t.revoked && !t.scopes?.includes("offline_access"))
			.map((t) => t.id);

		// Logout Tokens are signed through the JWT plugin's JWKS, so skip the
		// delivery plan when it is disabled. Registration already rejects
		// `backchannel_logout_uri` in that mode; this also guards stale clients.
		const eligibleClients = opts.disableJwtPlugin
			? []
			: clients.filter((c) => Boolean(c.backchannelLogoutUri) && !c.disabled);

		const targets = (
			await Promise.all(
				eligibleClients.map(async (client) => {
					try {
						return {
							client,
							sub: await resolveSubjectIdentifier(userId, client, opts),
						} satisfies BackchannelLogoutTarget;
					} catch (error) {
						logger.warn(
							`back-channel logout: unable to resolve subject for client ${client.clientId}`,
							error,
						);
						return null;
					}
				}),
			)
		).filter((target): target is BackchannelLogoutTarget => target !== null);

		return {
			accessTokenIds: accessToRevokeIds,
			refreshTokenIds: refreshToRevokeIds,
			sessionId,
			targets,
		};
	} catch (error) {
		logger.error("back-channel logout planning failed", error);
		return null;
	}
}

/**
 * Apply a prepared logout plan after the session deletion succeeds. Core runs
 * `session.delete.after` after the row is consumed and, for transactional
 * callers, only after the transaction commits.
 */
async function applyBackchannelLogoutPlan(
	ctx: GenericEndpointContext,
	plan: BackchannelLogoutPlan,
): Promise<void> {
	const revokedAt = new Date();
	const adapter = await getCurrentAdapter(ctx.context.adapter);
	const revocations = await Promise.allSettled([
		plan.accessTokenIds.length > 0
			? adapter.updateMany({
					model: "oauthAccessToken",
					where: [{ field: "id", operator: "in", value: plan.accessTokenIds }],
					update: { revoked: revokedAt },
				})
			: Promise.resolve(),
		plan.refreshTokenIds.length > 0
			? adapter.updateMany({
					model: "oauthRefreshToken",
					where: [{ field: "id", operator: "in", value: plan.refreshTokenIds }],
					update: { revoked: revokedAt },
				})
			: Promise.resolve(),
	]);
	// Session liveness remains authoritative, but operators still need a signal
	// if the stored revocation backstop drifts from the committed session state.
	for (const result of revocations) {
		if (result.status === "rejected") {
			ctx.context.logger.error(
				"back-channel logout: token revocation update failed",
				result.reason,
			);
		}
	}

	if (plan.targets.length > 0) {
		await deliverBackchannelLogoutTokens(ctx, plan);
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

export { applyBackchannelLogoutPlan, prepareBackchannelLogoutPlan };

const LOGOUT_CONFIRMATION_TTL_SECONDS = 5 * 60;
const LOGOUT_CONFIRMATION_COOKIE_SUFFIX = ".oauth_logout_confirmation";

type RPInitiatedLogoutRequest = {
	id_token_hint?: string;
	client_id?: string;
	post_logout_redirect_uri?: string;
	state?: string;
};

type CurrentBrowserSession = {
	session: Session;
};

type LogoutConfirmationState = {
	sessionId?: string;
	clientId?: string;
	postLogoutRedirectUri?: string;
	state?: string;
	redirectInvalid?: boolean;
	expiresAt: number;
};

type LogoutConfirmationContext = Omit<
	LogoutConfirmationState,
	"sessionId" | "expiresAt"
>;

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => {
		switch (character) {
			case "&":
				return "&amp;";
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case '"':
				return "&quot;";
			case "'":
				return "&#39;";
			default:
				return character;
		}
	});
}

function isBrowserNavigation(ctx: GenericEndpointContext): boolean {
	const headers = ctx.request?.headers ?? ctx.headers;
	if (!headers || isBrowserFetchRequest(headers)) return false;
	const accept = headers.get("accept") ?? "";
	return (
		headers.get("sec-fetch-mode") === "navigate" ||
		accept.includes("text/html") ||
		accept.includes("application/xhtml+xml")
	);
}

function logoutPage(title: string, body: string, status = 200): Response {
	return new Response(
		`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${body}</body></html>`,
		{
			status,
			headers: {
				"cache-control": "no-store",
				"content-security-policy":
					"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
				"content-type": "text/html; charset=utf-8",
				pragma: "no-cache",
				"x-content-type-options": "nosniff",
			},
		},
	);
}

function logoutConfirmationPath(ctx: GenericEndpointContext): string {
	return `${ctx.context.baseURL.replace(/\/$/, "")}/oauth2/end-session/confirm`;
}

function logoutConfirmationCookiePath(ctx: GenericEndpointContext): string {
	try {
		const url = new URL(logoutConfirmationPath(ctx));
		return url.pathname;
	} catch {
		return "/oauth2/end-session/confirm";
	}
}

function logoutConfirmationPage(ctx: GenericEndpointContext): Response {
	const action = logoutConfirmationPath(ctx);
	return logoutPage(
		"Confirm logout",
		`<main><h1>Confirm logout</h1><p>Do you want to log out of this account?</p><form method="post" data-oidc-logout-confirmation action="${escapeHtml(action)}"><button type="submit" name="action" value="confirm">Confirm logout</button></form></main>`,
	);
}

function logoutSuccessPage(note?: string): Response {
	const message = note ? `Logged out. ${escapeHtml(note)}` : "Logged out.";
	return logoutPage(
		"Logged out",
		`<main><p data-oidc-logout-state="logged-out">${message}</p></main>`,
	);
}

function logoutErrorPage(description: string, status: number): Response {
	return logoutPage(
		"Logout error",
		`<main><h1>Logout error</h1><p data-oidc-logout-state="error">${escapeHtml(description)}</p></main>`,
		status,
	);
}

function logoutProtocolError(
	ctx: GenericEndpointContext,
	status: "BAD_REQUEST" | "UNAUTHORIZED" | "INTERNAL_SERVER_ERROR",
	error: string,
	description: string,
): Response {
	if (isBrowserNavigation(ctx)) {
		const statusCode =
			status === "BAD_REQUEST" ? 400 : status === "UNAUTHORIZED" ? 401 : 500;
		return logoutErrorPage(description, statusCode);
	}
	throw new APIError(status, {
		error,
		error_description: description,
	});
}

function logoutConfirmationCookieName(ctx: GenericEndpointContext): string {
	return `${ctx.context.authCookies.sessionToken.name}${LOGOUT_CONFIRMATION_COOKIE_SUFFIX}`;
}

function logoutConfirmationCookieOptions(
	ctx: GenericEndpointContext,
	maxAge: number,
) {
	return {
		...ctx.context.authCookies.sessionToken.attributes,
		httpOnly: true,
		maxAge,
		path: logoutConfirmationCookiePath(ctx),
		sameSite: "lax" as const,
	};
}

async function setLogoutConfirmationState(
	ctx: GenericEndpointContext,
	sessionId?: string,
	confirmation: LogoutConfirmationContext = {},
): Promise<void> {
	const state: LogoutConfirmationState = {
		...(sessionId ? { sessionId } : {}),
		...confirmation,
		expiresAt: Date.now() + LOGOUT_CONFIRMATION_TTL_SECONDS * 1000,
	};
	await ctx.setSignedCookie(
		logoutConfirmationCookieName(ctx),
		JSON.stringify(state),
		ctx.context.secret,
		logoutConfirmationCookieOptions(ctx, LOGOUT_CONFIRMATION_TTL_SECONDS),
	);
}

async function getLogoutConfirmationState(
	ctx: GenericEndpointContext,
): Promise<LogoutConfirmationState | null> {
	const value = await ctx.getSignedCookie(
		logoutConfirmationCookieName(ctx),
		ctx.context.secret,
	);
	if (typeof value !== "string") return null;

	try {
		const parsed: unknown = JSON.parse(value);
		if (typeof parsed !== "object" || parsed === null) return null;
		const record = parsed as Record<string, unknown>;
		if (
			(record.sessionId !== undefined &&
				(typeof record.sessionId !== "string" ||
					record.sessionId.length === 0)) ||
			(record.clientId !== undefined &&
				(typeof record.clientId !== "string" ||
					record.clientId.length === 0)) ||
			(record.postLogoutRedirectUri !== undefined &&
				(typeof record.postLogoutRedirectUri !== "string" ||
					record.postLogoutRedirectUri.length === 0)) ||
			(record.state !== undefined && typeof record.state !== "string") ||
			(record.redirectInvalid !== undefined &&
				typeof record.redirectInvalid !== "boolean") ||
			(record.postLogoutRedirectUri !== undefined &&
				record.clientId === undefined) ||
			typeof record.expiresAt !== "number" ||
			!Number.isFinite(record.expiresAt)
		) {
			return null;
		}
		return {
			...(typeof record.sessionId === "string"
				? { sessionId: record.sessionId }
				: {}),
			...(typeof record.clientId === "string"
				? { clientId: record.clientId }
				: {}),
			...(typeof record.postLogoutRedirectUri === "string"
				? { postLogoutRedirectUri: record.postLogoutRedirectUri }
				: {}),
			...(typeof record.state === "string" ? { state: record.state } : {}),
			...(typeof record.redirectInvalid === "boolean"
				? { redirectInvalid: record.redirectInvalid }
				: {}),
			expiresAt: record.expiresAt,
		};
	} catch {
		return null;
	}
}

function clearLogoutConfirmationState(ctx: GenericEndpointContext): void {
	ctx.setCookie(
		logoutConfirmationCookieName(ctx),
		"",
		logoutConfirmationCookieOptions(ctx, 0),
	);
}

async function getCurrentBrowserSession(
	ctx: GenericEndpointContext,
): Promise<CurrentBrowserSession | null> {
	const token = await ctx.getSignedCookie(
		ctx.context.authCookies.sessionToken.name,
		ctx.context.secret,
	);
	if (typeof token !== "string" || token.length === 0) return null;

	try {
		const result = await ctx.context.internalAdapter.findSession(token);
		return result ? { session: result.session } : null;
	} catch (error) {
		ctx.context.logger.error(
			"Failed to read the current logout session",
			error,
		);
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error: "server_error",
			error_description: "Unable to read the current session",
		});
	}
}

async function findHintedSession(
	ctx: GenericEndpointContext,
	sessionId: string,
): Promise<Session | null> {
	try {
		return await ctx.context.adapter.findOne<Session>({
			model: "session",
			where: [{ field: "id", value: sessionId }],
		});
	} catch (error) {
		ctx.context.logger.error("Failed to read the hinted logout session", error);
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error: "server_error",
			error_description: "Unable to read the hinted session",
		});
	}
}

async function deleteLogoutSession(
	ctx: GenericEndpointContext,
	session: Session,
): Promise<void> {
	if (typeof session.token !== "string" || session.token.length === 0) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error: "server_error",
			error_description: "Unable to complete logout",
		});
	}
	try {
		await ctx.context.internalAdapter.deleteSession(session.token);
	} catch (error) {
		ctx.context.logger.error("Failed to delete the logout session", error);
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error: "server_error",
			error_description: "Unable to complete logout",
		});
	}
}

async function getLogoutClient(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	clientId: string,
): Promise<SchemaClient<Scope[]> | null> {
	try {
		return await getClient(ctx, opts, clientId);
	} catch (error) {
		ctx.context.logger.error("Failed to resolve the logout client", error);
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error: "server_error",
			error_description: "Unable to resolve the logout client",
		});
	}
}

function normalizeLogoutAudiences(value: unknown): string[] {
	const values = Array.isArray(value) ? value : [value];
	return values.filter(
		(candidate): candidate is string => typeof candidate === "string",
	);
}

function getHintClientId(payload: JWTPayload): string | null {
	if (typeof payload.aud === "string" && payload.aud.length > 0) {
		return payload.aud;
	}
	if (typeof payload.azp === "string" && payload.azp.length > 0) {
		return payload.azp;
	}
	const audiences = normalizeLogoutAudiences(payload.aud);
	return audiences.length === 1 ? audiences[0]! : null;
}

async function resolveHintClient(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	hint: string,
	clientId?: string,
): Promise<SchemaClient<Scope[]> | null> {
	if (clientId) return getLogoutClient(ctx, opts, clientId);

	let decoded: JWTPayload;
	try {
		decoded = decodeJwt(hint);
	} catch {
		return null;
	}
	// The hint is unverified at this point. Resolve at most one client before
	// signature verification so an attacker cannot amplify database lookups
	// with a large audience array. Multi-audience ID Tokens identify the
	// authorized party through azp.
	const candidate = getHintClientId(decoded);
	return candidate ? getLogoutClient(ctx, opts, candidate) : null;
}

async function verifyLogoutHint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	hint: string,
	client: SchemaClient<Scope[]>,
): Promise<JWTPayload | null> {
	try {
		let payload: JWTPayload;
		if (opts.disableJwtPlugin) {
			if (!client.clientSecret) return null;
			const secret = await decryptStoredClientSecret(
				ctx,
				opts.storeClientSecret,
				client.clientSecret,
			);
			const { payload: verifiedPayload } = await compactVerify(
				hint,
				new TextEncoder().encode(secret),
			);
			payload = JSON.parse(
				new TextDecoder().decode(verifiedPayload),
			) as JWTPayload;
		} else {
			const jwtPluginOptions = getJwtPlugin(ctx.context).options;
			const jwksUrl =
				jwtPluginOptions?.jwks?.remoteUrl ??
				`${ctx.context.baseURL}${jwtPluginOptions?.jwks?.jwksPath ?? "/jwks"}`;
			const jwks = await getJwks(hint, { jwksFetch: jwksUrl });
			const { payload: verifiedPayload } = await compactVerify(
				hint,
				createLocalJWKSet(jwks),
			);
			payload = JSON.parse(
				new TextDecoder().decode(verifiedPayload),
			) as JWTPayload;
		}

		if (payload.iss !== getIssuer(ctx, opts)) return null;
		if (!normalizeLogoutAudiences(payload.aud).includes(client.clientId)) {
			return null;
		}
		if (
			typeof payload.sid !== "string" ||
			payload.sid.length === 0 ||
			typeof payload.sub !== "string" ||
			payload.sub.length === 0
		) {
			return null;
		}
		return payload;
	} catch {
		return null;
	}
}

function getRegisteredLogoutRedirect(
	client: SchemaClient<Scope[]>,
	requestedURI?: string,
	state?: string,
): { uri?: string; invalid: boolean } {
	if (!requestedURI) return { invalid: false };
	if (!client.postLogoutRedirectUris?.includes(requestedURI)) {
		return { invalid: true };
	}
	if (!state) return { uri: requestedURI, invalid: false };
	try {
		const redirectURI = new URL(requestedURI);
		redirectURI.searchParams.set("state", state);
		return { uri: redirectURI.toString(), invalid: false };
	} catch {
		return { invalid: true };
	}
}

function getLogoutConfirmationContext(
	client: SchemaClient<Scope[]>,
	request: RPInitiatedLogoutRequest,
): LogoutConfirmationContext {
	if (!request.post_logout_redirect_uri) return {};
	const redirect = getRegisteredLogoutRedirect(
		client,
		request.post_logout_redirect_uri,
		request.state,
	);
	if (redirect.invalid) return { redirectInvalid: true };
	return {
		clientId: client.clientId,
		postLogoutRedirectUri: request.post_logout_redirect_uri,
		...(request.state !== undefined ? { state: request.state } : {}),
	};
}

async function getConfirmedLogoutRedirect(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	state: LogoutConfirmationState,
): Promise<{ uri?: string; invalid: boolean }> {
	if (state.redirectInvalid) return { invalid: true };
	if (!state.clientId || !state.postLogoutRedirectUri) {
		return { invalid: false };
	}
	const client = await getLogoutClient(ctx, opts, state.clientId);
	if (!client || client.disabled || !client.enableEndSession) {
		return { invalid: true };
	}
	return getRegisteredLogoutRedirect(
		client,
		state.postLogoutRedirectUri,
		state.state,
	);
}

async function confirmationRequired(
	ctx: GenericEndpointContext,
	currentSession: CurrentBrowserSession | null,
	confirmation: LogoutConfirmationContext = {},
): Promise<Response> {
	if (!currentSession) {
		if (isBrowserNavigation(ctx)) {
			await setLogoutConfirmationState(ctx, undefined, confirmation);
			return logoutConfirmationPage(ctx);
		}
		return logoutProtocolError(
			ctx,
			"BAD_REQUEST",
			"invalid_request",
			"No active session is available for logout",
		);
	}
	if (!isBrowserNavigation(ctx)) {
		return logoutProtocolError(
			ctx,
			"BAD_REQUEST",
			"invalid_request",
			"User confirmation is required to complete logout",
		);
	}
	await setLogoutConfirmationState(
		ctx,
		currentSession.session.id,
		confirmation,
	);
	return logoutConfirmationPage(ctx);
}

async function completeConfirmedLogout(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
): Promise<OAuthRedirectResult | Response | null> {
	const state = await getLogoutConfirmationState(ctx);
	const currentSession = await getCurrentBrowserSession(ctx);
	if (!state || state.expiresAt <= Date.now()) {
		return logoutProtocolError(
			ctx,
			"BAD_REQUEST",
			"invalid_request",
			"The logout confirmation is invalid or expired",
		);
	}
	const redirect = await getConfirmedLogoutRedirect(ctx, opts, state);
	if (!currentSession) {
		clearLogoutConfirmationState(ctx);
		if (redirect.uri) return handleRedirect(ctx, redirect.uri);
		return isBrowserNavigation(ctx)
			? logoutSuccessPage(
					redirect.invalid
						? "The requested post-logout redirect was not registered."
						: undefined,
				)
			: logoutProtocolError(
					ctx,
					"BAD_REQUEST",
					"invalid_request",
					"No active session is available for logout",
				);
	}
	if (state.sessionId && state.sessionId !== currentSession.session.id) {
		return logoutProtocolError(
			ctx,
			"BAD_REQUEST",
			"invalid_request",
			"The logout confirmation is invalid or expired",
		);
	}

	await deleteLogoutSession(ctx, currentSession.session);
	deleteSessionCookie(ctx);
	clearLogoutConfirmationState(ctx);
	if (redirect.uri) return handleRedirect(ctx, redirect.uri);
	return isBrowserNavigation(ctx)
		? logoutSuccessPage(
				redirect.invalid
					? "The requested post-logout redirect was not registered."
					: undefined,
			)
		: null;
}

/**
 * RP-Initiated Logout (OIDC RP-Initiated Logout 1.0). The RP presents a signed
 * `id_token_hint`; after verification, the OP terminates the matching session
 * and optionally redirects to `post_logout_redirect_uri`. Requests without a
 * usable hint, and hints that do not identify the current browser session, use
 * a signed, short-lived OP confirmation state before terminating that session.
 *
 * Session termination goes through `internalAdapter.deleteSession`, which fires
 * `session.delete.after` so the hook drives revocation and back-channel
 * notifications to every RP with tokens on the session.
 *
 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html
 */
export async function rpInitiatedLogoutEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	const query = (ctx.query ?? {}) as RPInitiatedLogoutRequest;
	const body = (ctx.body ?? {}) as RPInitiatedLogoutRequest;
	const request: RPInitiatedLogoutRequest = { ...query, ...body };

	const currentSession = await getCurrentBrowserSession(ctx);
	const hasHint = request.id_token_hint !== undefined;

	if (!hasHint) {
		let confirmation: LogoutConfirmationContext = {};
		if (request.client_id) {
			const client = await getLogoutClient(ctx, opts, request.client_id);
			if (!client) {
				return logoutProtocolError(
					ctx,
					"BAD_REQUEST",
					"invalid_client",
					"The logout client does not exist",
				);
			}
			if (client.disabled) {
				return logoutProtocolError(
					ctx,
					"BAD_REQUEST",
					"invalid_client",
					"The logout client is disabled",
				);
			}
			if (!client.enableEndSession) {
				return logoutProtocolError(
					ctx,
					"UNAUTHORIZED",
					"invalid_client",
					"The client is not allowed to initiate logout",
				);
			}
			confirmation = getLogoutConfirmationContext(client, request);
		}
		return confirmationRequired(ctx, currentSession, confirmation);
	}

	const client = await resolveHintClient(
		ctx,
		opts,
		request.id_token_hint!,
		request.client_id,
	);
	if (!client) {
		if (currentSession && isBrowserNavigation(ctx)) {
			return confirmationRequired(ctx, currentSession);
		}
		return logoutProtocolError(
			ctx,
			"BAD_REQUEST",
			"invalid_client",
			"The logout client does not exist",
		);
	}
	if (client.disabled) {
		return logoutProtocolError(
			ctx,
			"BAD_REQUEST",
			"invalid_client",
			"The logout client is disabled",
		);
	}
	if (!client.enableEndSession) {
		return logoutProtocolError(
			ctx,
			"UNAUTHORIZED",
			"invalid_client",
			"The client is not allowed to initiate logout",
		);
	}

	const idTokenPayload = await verifyLogoutHint(
		ctx,
		opts,
		request.id_token_hint!,
		client,
	);
	if (!idTokenPayload) {
		if (currentSession && isBrowserNavigation(ctx)) {
			return confirmationRequired(
				ctx,
				currentSession,
				request.client_id ? getLogoutConfirmationContext(client, request) : {},
			);
		}
		return logoutProtocolError(
			ctx,
			"UNAUTHORIZED",
			"invalid_token",
			"The id_token_hint is invalid",
		);
	}

	const sessionId = idTokenPayload.sid as string;
	const hintedSession = await findHintedSession(ctx, sessionId);
	const matchesCurrentSession = currentSession?.session.id === sessionId;
	if (currentSession && !matchesCurrentSession) {
		return confirmationRequired(
			ctx,
			currentSession,
			getLogoutConfirmationContext(client, request),
		);
	}

	const redirect = getRegisteredLogoutRedirect(
		client,
		request.post_logout_redirect_uri,
		request.state,
	);
	const sessionToDelete =
		hintedSession ?? (matchesCurrentSession ? currentSession?.session : null);
	if (sessionToDelete) {
		// internalAdapter.deleteSession triggers the normal before/after session
		// hooks, including revocation and back-channel dispatch for every RP.
		await deleteLogoutSession(ctx, sessionToDelete);
	}
	if (matchesCurrentSession) deleteSessionCookie(ctx);
	clearLogoutConfirmationState(ctx);

	if (redirect.uri) return handleRedirect(ctx, redirect.uri);
	return isBrowserNavigation(ctx)
		? logoutSuccessPage(
				redirect.invalid
					? "The requested post-logout redirect was not registered."
					: undefined,
			)
		: null;
}

/**
 * Completes the browser confirmation flow for RP-Initiated Logout. This route
 * is intentionally scoped to HTTP delivery so it does not become a generated
 * client action; the signed cookie is the only confirmation context it accepts.
 */
export async function rpInitiatedLogoutConfirmationEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	return completeConfirmedLogout(ctx, opts);
}
