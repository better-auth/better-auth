import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { defineRequestState, hasRequestState } from "@better-auth/core/context";
import { APIError } from "@better-auth/core/error";
import { sessionMiddleware } from "better-auth/api";
import { createCookieGetter, parseCookies } from "better-auth/cookies";
import { symmetricDecodeJWT, symmetricEncodeJWT } from "better-auth/crypto";
import { base64url, calculateJwkThumbprint } from "jose";
import type { ProofError, ProofKey } from "./proof";
import { verifyProof } from "./proof";
import type { Algorithm } from "./protocol";
import {
	CHALLENGE_HEADER,
	challengeHeader,
	REGISTRATION_HEADER,
	RESPONSE_HEADER,
	readItem,
	registrationHeader,
	SESSION_ID_HEADER,
} from "./protocol";
import type { DbscBinding } from "./schema";
import type { DbscEvent, ResolvedDbscOptions } from "./types";

export const REGISTER_PATH = "/dbsc/register";
export const REFRESH_PATH = "/dbsc/refresh";

// Renamable through `advanced.cookies` like any other auth cookie.
const BOUND_COOKIE = "dbsc";
const OFFER_COOKIE = "dbsc-offer";

// HKDF salts keep each sealed value usable for one purpose only.
const REGISTRATION_SALT = "better-auth-dbsc-registration";
const CHALLENGE_SALT = "better-auth-dbsc-challenge";
const COOKIE_SALT = "better-auth-dbsc-cookie";

// Long enough for a slow TPM to sign right after sign-in.
const REGISTRATION_EXPIRES_IN = 300;
// Chrome refreshes up to 120s before the cookie expires and should still hold
// a usable challenge then, or every refresh costs an extra 403 round trip.
const CHALLENGE_GRACE = 120;
// The browser drops the cookie a little before the server stops accepting it.
const COOKIE_GRACE = 5;
// Requests already in flight when registration completes carry no bound
// cookie yet. Without this window enforcement would sign the user out right
// after signing in.
const REGISTRATION_GRACE_MS = 10_000;
// A ticket is only issued when a session is created and dies after
// REGISTRATION_EXPIRES_IN, so past this age an unbound session stays unbound.
const BINDABLE_FOR_MS = (REGISTRATION_EXPIRES_IN + 60) * 1000;

const createdSessions = defineRequestState(() => new Set<string>());

/**
 * Remembers a session this request created. `newSession` alone is not enough:
 * it is also set when an existing session's cookie is re-issued, and offering
 * registration then would let a stolen cookie be bound to the thief's key.
 */
export async function markSessionCreated(sessionId: string) {
	const inRequest = await hasRequestState();
	if (!inRequest) return;
	const created = await createdSessions.get();
	created.add(sessionId);
}

/**
 * Offers DBSC registration for a session this request created. The challenge
 * is a sealed ticket naming that session, because after an OAuth or SAML
 * callback the registration POST arrives without the Lax session cookie.
 * Offering costs no write, so browsers without DBSC pay nothing.
 *
 * A sign-in made through `auth.api` on the server has no response the browser
 * reads headers from, so the ticket waits in a cookie and is offered on the
 * browser's next request.
 */
export async function offerRegistration(
	ctx: GenericEndpointContext,
	options: ResolvedDbscOptions,
) {
	const waiting = createCookieGetter(ctx.context.options)(OFFER_COOKIE);
	const created = await createdTicket(ctx, options);
	if (!ctx.request) {
		if (!created) return;
		ctx.setCookie(waiting.name, created, {
			...waiting.attributes,
			maxAge: REGISTRATION_EXPIRES_IN,
		});
		return;
	}
	const ticket = created ?? ctx.getCookie(waiting.name);
	if (!ticket) return;
	if (!created) {
		ctx.setCookie(waiting.name, "", { ...waiting.attributes, maxAge: 0 });
	}
	ctx.setHeader(
		REGISTRATION_HEADER,
		registrationHeader(
			options.algorithms,
			`${basePath(ctx)}${REGISTER_PATH}`,
			ticket,
		),
	);
}

async function createdTicket(
	ctx: GenericEndpointContext,
	options: ResolvedDbscOptions,
) {
	const newSession = ctx.context.newSession;
	if (!newSession) return null;
	const created = await createdSessions.get();
	if (!created.has(newSession.session.id)) return null;
	const offered = options.shouldOffer
		? await options.shouldOffer({ ...newSession, request: ctx.request })
		: true;
	if (!offered) return null;
	return symmetricEncodeJWT(
		{ token: newSession.session.token },
		ctx.context.secretConfig,
		REGISTRATION_SALT,
		REGISTRATION_EXPIRES_IN,
	);
}

export const register = (options: ResolvedDbscOptions) =>
	createAuthEndpoint(
		REGISTER_PATH,
		{
			method: "POST",
			metadata: {
				openapi: {
					description: "DBSC registration endpoint called by the browser",
				},
			},
		},
		async (ctx) => {
			ctx.setHeader("cache-control", "no-store");
			const proof = readItem(ctx.headers?.get(RESPONSE_HEADER));
			if (!proof) return reject(ctx, options, "malformed_proof");
			const verified = await verifyProof(proof, {
				algorithms: options.algorithms,
			});
			if ("error" in verified) return reject(ctx, options, verified.error);

			const ticket = await symmetricDecodeJWT<{ token?: unknown }>(
				verified.challenge,
				ctx.context.secretConfig,
				REGISTRATION_SALT,
			);
			const token = ticket?.token;
			if (typeof token !== "string" || !token) {
				return reject(ctx, options, "invalid_ticket");
			}
			// The cookie is absent after a cross-site sign-in, but when it is
			// there a ticket for another session was lifted from elsewhere.
			const current = await ctx.getSignedCookie(
				ctx.context.authCookies.sessionToken.name,
				ctx.context.secret,
			);
			if (current && current !== token) {
				return reject(ctx, options, "invalid_ticket");
			}
			const found = await ctx.context.internalAdapter.findSession(token);
			if (!found || found.session.expiresAt <= new Date()) {
				return reject(ctx, options, "session_not_found");
			}

			const now = new Date();
			const tokenHash = await hashToken(token);
			const thumbprint = await calculateJwkThumbprint(verified.key.jwk);
			// Unique `tokenHash` and `thumbprint` make a replayed ticket or a
			// reused key fail here, so registration needs no separate store.
			const binding = await ctx.context.adapter
				.create<Omit<DbscBinding, "id">, DbscBinding>({
					model: "dbscBinding",
					data: {
						tokenHash,
						userId: found.user.id,
						publicKey: JSON.stringify(verified.key.jwk),
						algorithm: verified.key.algorithm,
						thumbprint,
						lastChallengeAt: 0,
						expiresAt: found.session.expiresAt,
						createdAt: now,
						updatedAt: now,
					},
				})
				.catch(() => null);
			if (!binding) return reject(ctx, options, "already_bound");

			// A session that expires without being deleted leaves its row behind.
			// A binding's expiry can trail its session's, so only rows a whole
			// session lifetime past it are certain to be dead.
			const dead = new Date(
				now.getTime() - ctx.context.sessionConfig.expiresIn * 1000,
			);
			await ctx.context.runInBackgroundOrAwait(
				ctx.context.adapter
					.deleteMany({
						model: "dbscBinding",
						where: [
							{ field: "userId", value: binding.userId },
							{ field: "expiresAt", operator: "lt", value: dead },
						],
					})
					.catch((error: unknown) =>
						ctx.context.logger.warn("Failed to delete expired DBSC bindings", {
							error,
						}),
					),
			);

			await emit(ctx.context, options, {
				type: "registered",
				bindingId: binding.id,
				sessionId: found.session.id,
				userId: binding.userId,
			});
			return issue(ctx, options, binding);
		},
	);

/**
 * Status codes follow what Chrome does with them: only a 403 with a challenge
 * asks for a proof, 5xx keeps the session, and any other 3xx or 4xx deletes
 * it. Database errors are left to throw so they surface as a 500.
 */
export const refresh = (options: ResolvedDbscOptions) =>
	createAuthEndpoint(
		REFRESH_PATH,
		{
			method: "POST",
			metadata: {
				openapi: {
					description: "DBSC refresh endpoint called by the browser",
				},
			},
		},
		async (ctx) => {
			ctx.setHeader("cache-control", "no-store");
			// Only the browser itself calls this, never a page or a frame.
			ctx.setHeader("cross-origin-resource-policy", "same-origin");
			ctx.setHeader("x-frame-options", "DENY");
			const bindingId = readItem(ctx.headers?.get(SESSION_ID_HEADER));
			if (!bindingId) {
				ctx.setStatus(400);
				return ctx.json(null);
			}

			const binding = await ctx.context.adapter.findOne<DbscBinding>({
				model: "dbscBinding",
				where: [{ field: "id", value: bindingId }],
			});
			if (!binding) return end(ctx, options, bindingId, "binding_not_found");

			// The proof alone must be enough. A refresh started by a request from
			// another site carries no Lax session cookie, and with several
			// sessions in the browser the cookie names whichever is active. A
			// bound cookie is worthless without a live session anyway. Only when
			// the cookie is this binding's session does the refresh also re-check
			// revocation and expiry.
			const token = await ctx.getSignedCookie(
				ctx.context.authCookies.sessionToken.name,
				ctx.context.secret,
			);
			const tokenHash = token ? await hashToken(token) : null;
			const own = tokenHash === binding.tokenHash;
			const found =
				token && own
					? await ctx.context.internalAdapter.findSession(token)
					: null;
			if (own && (!found || found.session.expiresAt <= new Date())) {
				return end(ctx, options, bindingId, "session_not_found");
			}

			const proof = readItem(ctx.headers?.get(RESPONSE_HEADER));
			if (!proof) return challenge(ctx, options, binding);
			const verified = await verifyProof(proof, {
				key: proofKey(binding),
			});
			if ("error" in verified) {
				return reject(ctx, options, verified.error, binding.id);
			}

			// A valid signature over a stale or used challenge is a race between
			// tabs, not an attack, so it gets a fresh challenge instead of a 4xx.
			const issued = await symmetricDecodeJWT<{ sid?: unknown; at?: unknown }>(
				verified.challenge,
				ctx.context.secretConfig,
				CHALLENGE_SALT,
			);
			const issuedAt = issued?.at;
			if (issued?.sid !== binding.id || typeof issuedAt !== "number") {
				return challenge(ctx, options, binding);
			}
			const consumed = await ctx.context.adapter.incrementOne<DbscBinding>({
				model: "dbscBinding",
				where: [
					{ field: "id", value: binding.id },
					{ field: "lastChallengeAt", operator: "lt", value: issuedAt },
				],
				increment: {},
				// Sessions extend on `updateAge`, so the binding follows the session.
				set: {
					lastChallengeAt: issuedAt,
					updatedAt: new Date(),
					...(found && { expiresAt: found.session.expiresAt }),
				},
			});
			if (!consumed) return challenge(ctx, options, binding);

			await emit(ctx.context, options, {
				type: "refreshed",
				bindingId: binding.id,
			});
			return issue(ctx, options, consumed);
		},
	);

/**
 * Reports whether the current session is bound and whether this request
 * carries a fresh bound cookie, for apps that gate sensitive actions on it.
 * `stale` is normal right after a cross-site navigation, which Chrome sends
 * without refreshing first.
 */
export const getDbscState = (options: ResolvedDbscOptions) =>
	createAuthEndpoint.serverOnly(
		{
			method: "GET",
			requireHeaders: true,
			use: [sessionMiddleware],
		},
		async (ctx) => {
			const tokenHash = await hashToken(ctx.context.session.session.token);
			const known = await cookieState(ctx, tokenHash);
			if (known) return ctx.json({ status: known });
			const binding = await ctx.context.adapter.findOne<DbscBinding>({
				model: "dbscBinding",
				where: [{ field: "tokenHash", value: tokenHash }],
			});
			return ctx.json({
				status: binding ? ("stale" as const) : ("unbound" as const),
			});
		},
	);

/**
 * With `enforce`, makes a bound session without a fresh bound cookie look
 * signed out to every endpoint, by dropping its session cookies from the
 * request the same way the bearer plugin adds one. Every cookie that carries
 * a session token is checked, which includes the ones the multi-session
 * plugin keeps for the browser's other sessions.
 *
 * Before hooks all see the original request, so the cookie the bearer plugin
 * adds from an `Authorization` header cannot be dropped here. A copied token
 * presented that way is rejected outright instead.
 */
export async function enforceBinding(
	ctx: GenericEndpointContext,
	options: ResolvedDbscOptions,
) {
	const bearer = ctx.context.hasPlugin("bearer") ? bearerToken(ctx) : null;
	const bearerBlocked = bearer ? await isBlocked(ctx, options, bearer) : false;
	if (bearerBlocked) throw new APIError("UNAUTHORIZED");
	const { sessionToken, sessionData } = ctx.context.authCookies;
	const cookies = parseCookies(ctx.headers?.get("cookie") ?? "");
	const blocked = new Set<string>();
	for (const name of cookies.keys()) {
		if (!name.startsWith(sessionToken.name)) continue;
		const token = await ctx.getSignedCookie(name, ctx.context.secret);
		if (!token) continue;
		const isBlockedSession = await isBlocked(ctx, options, token);
		if (isBlockedSession) blocked.add(name);
	}
	if (!blocked.size) return;

	// The cookie cache describes the active session, so it goes with it.
	const active = blocked.has(sessionToken.name);
	const kept = [...cookies].filter(
		([name]) =>
			!blocked.has(name) &&
			!(active && name === sessionData.name) &&
			!(active && name.startsWith(`${sessionData.name}.`)),
	);
	return {
		context: {
			headers: new Headers({
				cookie: kept
					.map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
					.join("; "),
			}),
		},
	};
}

/**
 * Whether the session is bound but this request does not prove it. The
 * session's own cookie answers without the database: a fresh bound cookie, or
 * the note left for a session that can no longer be bound.
 */
async function isBlocked(
	ctx: GenericEndpointContext,
	options: ResolvedDbscOptions,
	token: string,
) {
	const tokenHash = await hashToken(token);
	const known = await cookieState(ctx, tokenHash);
	if (known) return false;
	const binding = await ctx.context.adapter.findOne<DbscBinding>({
		model: "dbscBinding",
		where: [{ field: "tokenHash", value: tokenHash }],
	});
	if (!binding) {
		await noteUnbound(ctx, token, tokenHash);
		return false;
	}
	const registeredAt = new Date(binding.createdAt).getTime();
	if (Date.now() - registeredAt < REGISTRATION_GRACE_MS) return false;
	// In monitor mode the check runs and reports, but nothing is rejected.
	const enforced = options.enforce === true;
	await emit(ctx.context, options, {
		type: "blocked",
		bindingId: binding.id,
		reason: ctx.getCookie(boundCookie(ctx, tokenHash).name)
			? "invalid"
			: "missing",
		enforced,
	});
	return enforced;
}

/**
 * Most sessions are never bound, and without this each of their requests
 * would cost a lookup. Once a session is too old to register, a long-lived
 * note in its cookie says so. The note is only ever issued for a session
 * without a binding, so it proves nothing for a bound one.
 */
async function noteUnbound(
	ctx: GenericEndpointContext,
	token: string,
	tokenHash: string,
) {
	const found = await ctx.context.internalAdapter.findSession(token);
	if (!found) return;
	const age = Date.now() - new Date(found.session.createdAt).getTime();
	if (age < BINDABLE_FOR_MS) return;
	const cookie = boundCookie(ctx, tokenHash);
	const maxAge = ctx.context.sessionConfig.expiresIn;
	const value = await symmetricEncodeJWT(
		{ th: tokenHash, unbound: true },
		ctx.context.secretConfig,
		COOKIE_SALT,
		maxAge,
	);
	ctx.setCookie(cookie.name, value, { ...cookie.attributes, maxAge });
}

/**
 * Reads the session token the bearer plugin would accept: the raw token, or
 * the part before the signature of a signed one.
 */
function bearerToken(ctx: GenericEndpointContext) {
	const header = ctx.headers?.get("authorization");
	if (!header || header.slice(0, 7).toLowerCase() !== "bearer ") return null;
	const value = header.slice(7).trim();
	const decoded = value.includes("%") ? safeDecode(value) : value;
	return decoded.split(".")[0] || null;
}

function safeDecode(value: string) {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

/**
 * What the session's own cookie says, if it is present, unexpired and issued
 * for this session.
 */
async function cookieState(ctx: GenericEndpointContext, tokenHash: string) {
	const value = ctx.getCookie(boundCookie(ctx, tokenHash).name);
	if (!value) return null;
	const sealed = await symmetricDecodeJWT<{ th?: unknown; unbound?: unknown }>(
		value,
		ctx.context.secretConfig,
		COOKIE_SALT,
	);
	if (sealed?.th !== tokenHash) return null;
	return sealed.unbound === true ? "unbound" : "bound";
}

export async function hashToken(token: string) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(token),
	);
	return base64url.encode(new Uint8Array(digest));
}

/**
 * Ends a successful registration or refresh: rotates the bound cookie, hands
 * out the next challenge so the next refresh needs no 403, and repeats the
 * session config so a changed cookie setting reaches the browser.
 */
async function issue(
	ctx: GenericEndpointContext,
	options: ResolvedDbscOptions,
	binding: DbscBinding,
) {
	const cookie = boundCookie(ctx, binding.tokenHash);
	const value = await symmetricEncodeJWT(
		{ th: binding.tokenHash },
		ctx.context.secretConfig,
		COOKIE_SALT,
		options.boundCookieMaxAge + COOKIE_GRACE,
	);
	ctx.setCookie(cookie.name, value, {
		...cookie.attributes,
		maxAge: options.boundCookieMaxAge,
	});
	const next = await sealChallenge(ctx, options, binding);
	ctx.setHeader(CHALLENGE_HEADER, challengeHeader(next, binding.id));
	return ctx.json({
		session_identifier: binding.id,
		refresh_url: `${basePath(ctx)}${REFRESH_PATH}`,
		scope: { include_site: false },
		credentials: [
			{ type: "cookie", name: cookie.name, attributes: cookie.credential },
		],
		// Without this Chrome sends a navigation arriving from another site
		// before refreshing, and the first page would see no bound cookie.
		allowed_refresh_initiators: options.allowedRefreshInitiators,
	});
}

async function challenge(
	ctx: GenericEndpointContext,
	options: ResolvedDbscOptions,
	binding: DbscBinding,
) {
	const next = await sealChallenge(ctx, options, binding);
	ctx.setHeader(CHALLENGE_HEADER, challengeHeader(next, binding.id));
	ctx.setStatus(403);
	return ctx.json(null);
}

/**
 * Tells the browser to drop its DBSC session. The binding row is left alone:
 * the request may come from anyone holding the session id, and the row goes
 * away with the session through the delete hook.
 */
async function end(
	ctx: GenericEndpointContext,
	options: ResolvedDbscOptions,
	bindingId: string,
	reason: "binding_not_found" | "session_not_found",
) {
	await emit(ctx.context, options, { type: "ended", bindingId, reason });
	return ctx.json({ session_identifier: bindingId, continue: false });
}

async function reject(
	ctx: GenericEndpointContext,
	options: ResolvedDbscOptions,
	reason: ProofError | "invalid_ticket" | "session_not_found" | "already_bound",
	bindingId?: string,
) {
	await emit(ctx.context, options, { type: "rejected", reason, bindingId });
	ctx.setStatus(400);
	return ctx.json({ error: reason });
}

function sealChallenge(
	ctx: GenericEndpointContext,
	options: ResolvedDbscOptions,
	binding: DbscBinding,
) {
	// Never at or below the watermark, or a server whose clock runs behind
	// would hand out challenges that are already spent and Chrome would
	// delete the session after five 403s.
	const at = Math.max(Date.now(), Number(binding.lastChallengeAt) + 1);
	return symmetricEncodeJWT(
		{ sid: binding.id, at },
		ctx.context.secretConfig,
		CHALLENGE_SALT,
		options.boundCookieMaxAge + CHALLENGE_GRACE,
	);
}

/**
 * Builds the bound cookie from the auth cookie config, so `Set-Cookie` and
 * the `attributes` Chrome matches against cannot drift apart. Chrome rejects
 * `Max-Age`, `Expires` and `Partitioned` there, so they stay out.
 */
function boundCookie(ctx: GenericEndpointContext, tokenHash: string) {
	const cookie = createCookieGetter(ctx.context.options)(BOUND_COOKIE);
	// One cookie per session, named from the token it is bound to, so several
	// sessions in one browser each keep their own proof.
	const name = `${cookie.name}_${tokenHash.slice(0, 12)}`;
	const attributes = cookie.attributes;
	const credential = [
		attributes.domain && `Domain=${attributes.domain}`,
		`Path=${attributes.path ?? "/"}`,
		attributes.secure && "Secure",
		attributes.httpOnly && "HttpOnly",
		attributes.sameSite && `SameSite=${capitalize(attributes.sameSite)}`,
	]
		.filter(Boolean)
		.join("; ");
	return { name, attributes, credential };
}

function proofKey(binding: DbscBinding): ProofKey {
	return {
		jwk: JSON.parse(binding.publicKey),
		algorithm: binding.algorithm as Algorithm,
	};
}

function basePath(ctx: GenericEndpointContext) {
	return new URL(ctx.context.baseURL).pathname.replace(/\/+$/, "");
}

function capitalize(value: string) {
	return `${value[0]?.toUpperCase()}${value.slice(1).toLowerCase()}`;
}

/**
 * Runs the user's event hook without letting it break the protocol response.
 */
export async function emit(
	context: AuthContext,
	options: ResolvedDbscOptions,
	event: DbscEvent,
) {
	if (!options.onEvent) return;
	await Promise.resolve()
		.then(() => options.onEvent?.(event))
		.catch((error: unknown) =>
			context.logger.error("DBSC onEvent hook failed", error),
		);
}
