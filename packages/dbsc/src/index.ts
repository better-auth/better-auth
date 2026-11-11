import type {
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import { defineRequestState } from "@better-auth/core/context";
import type { Session } from "@better-auth/core/db";
import { APIError, BetterAuthError } from "@better-auth/core/error";
import { isAPIError } from "@better-auth/core/utils/is-api-error";
import { expireCookie, setCookieCache } from "better-auth/cookies";
import {
	generateRandomString,
	symmetricDecrypt,
	symmetricEncrypt,
} from "better-auth/crypto";
import { mergeSchema } from "better-auth/db";
import type { InferOptionSchema } from "better-auth/types";
import { DBSC_ERROR_CODES } from "./error-codes";
import {
	CHALLENGE_HEADER,
	parseStoredPublicKey,
	REGISTRATION_HEADER,
	RESPONSE_HEADER,
	readHeaderString,
	SESSION_ID_HEADER,
	serializeChallengeHeader,
	serializeCookieAttributes,
	serializeRegistrationHeader,
	toRefreshInitiators,
	verifyRefreshProof,
	verifyRegistrationProof,
} from "./protocol";
import { schema } from "./schema";
import { PACKAGE_VERSION } from "./version";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		dbsc: {
			creator: typeof dbsc;
		};
	}
}

export { DBSC_ERROR_CODES } from "./error-codes";

export interface DbscOptions {
	/**
	 * How long a bound cookie stays valid, in seconds. Chrome replaces it with
	 * a freshly signed one about two minutes before it expires, so this is
	 * also the longest a stolen bound cookie keeps working.
	 *
	 * Must be at least 300: shorter values make Chrome sign on almost every
	 * request and run out of its signing quota.
	 *
	 * @default 600
	 */
	boundCookieMaxAge?: number | undefined;
	/**
	 * Custom schema for the plugin's session field.
	 */
	schema?: InferOptionSchema<typeof schema> | undefined;
}

const DEFAULT_BOUND_COOKIE_MAX_AGE = 600;
const MIN_BOUND_COOKIE_MAX_AGE = 300;
/** How long a sign-in may wait for the browser to register its key. */
const REGISTRATION_WINDOW_SECONDS = 5 * 60;
/** How long a refresh challenge stays valid. */
const CHALLENGE_TTL_SECONDS = 5 * 60;

const BOUND_COOKIE_VALUE_PREFIX = "dbsc:";
const REGISTER_PATH = "/dbsc/register";
const REFRESH_PATH = "/dbsc/refresh";

/** Chrome calls these endpoints directly; they are not part of the client API. */
const PROTOCOL_ENDPOINT_OPTIONS = {
	method: "POST",
	disableBody: true,
	requireHeaders: true,
	metadata: { scope: "server" },
} as const;

const registrationIdentifier = (challenge: string) =>
	`dbsc-registration:${challenge}`;
const challengeIdentifier = (challenge: string) =>
	`dbsc-challenge:${challenge}`;

function authPath(ctx: GenericEndpointContext, path: string) {
	return `${new URL(ctx.context.baseURL).pathname.replace(/\/$/, "")}${path}`;
}

/** Tokens of the sessions created while handling the current request. */
const createdSessionTokens = defineRequestState<Set<string>>(() => new Set());

/**
 * Binds sessions to a key held in the device's secure hardware, using
 * Device Bound Session Credentials. Once the browser registers a key, the
 * session is accepted only together with a short-lived bound cookie that the
 * browser renews by signing a challenge, so a copied session cookie stops
 * working on another device.
 *
 * Browsers without support keep working with ordinary sessions.
 */
export const dbsc = (options?: DbscOptions | undefined) => {
	const boundCookieMaxAge =
		options?.boundCookieMaxAge ?? DEFAULT_BOUND_COOKIE_MAX_AGE;
	if (
		!Number.isFinite(boundCookieMaxAge) ||
		boundCookieMaxAge < MIN_BOUND_COOKIE_MAX_AGE
	) {
		throw new BetterAuthError(
			`dbsc: boundCookieMaxAge must be at least ${MIN_BOUND_COOKIE_MAX_AGE} seconds.`,
		);
	}

	function boundCookie(ctx: GenericEndpointContext, sessionId: string) {
		return ctx.context.createAuthCookie(`dbsc_${sessionId}`, {
			maxAge: boundCookieMaxAge,
		});
	}

	async function hasValidBoundCookie(
		ctx: GenericEndpointContext,
		sessionId: string,
	) {
		const value = await ctx.getSignedCookie(
			boundCookie(ctx, sessionId).name,
			ctx.context.secret,
		);
		if (
			typeof value !== "string" ||
			!value.startsWith(BOUND_COOKIE_VALUE_PREFIX)
		) {
			return false;
		}
		const separator = value.lastIndexOf(":");
		const boundSessionId = value.slice(
			BOUND_COOKIE_VALUE_PREFIX.length,
			separator,
		);
		const expiresAt = Number(value.slice(separator + 1));
		return boundSessionId === sessionId && expiresAt > Date.now();
	}

	async function setBoundCookie(
		ctx: GenericEndpointContext,
		sessionId: string,
	) {
		const cookie = boundCookie(ctx, sessionId);
		const expiresAt = Date.now() + boundCookieMaxAge * 1000;
		await ctx.setSignedCookie(
			cookie.name,
			`${BOUND_COOKIE_VALUE_PREFIX}${sessionId}:${expiresAt}`,
			ctx.context.secret,
			cookie.attributes,
		);
		return cookie;
	}

	/** Stores a single-use challenge whose row holds `value`. */
	async function issueChallenge(
		ctx: GenericEndpointContext,
		toIdentifier: (challenge: string) => string,
		value: string,
		ttlSeconds: number,
	) {
		const challenge = generateRandomString(32);
		await ctx.context.internalAdapter.createVerificationValue({
			identifier: toIdentifier(challenge),
			value,
			expiresAt: new Date(Date.now() + ttlSeconds * 1000),
		});
		return challenge;
	}

	async function sessionInstructions(
		ctx: GenericEndpointContext,
		session: Session,
		sessionIdentifier: string,
	) {
		const cookie = await setBoundCookie(ctx, session.id);
		// Chrome keeps this challenge for its next refresh, which then needs a
		// single request instead of a request that is answered with a challenge.
		const nextChallenge = await issueChallenge(
			ctx,
			challengeIdentifier,
			session.id,
			boundCookieMaxAge,
		);
		ctx.setHeader(
			CHALLENGE_HEADER,
			serializeChallengeHeader({
				challenge: nextChallenge,
				sessionIdentifier,
			}),
		);
		ctx.setHeader("cache-control", "no-store");
		return ctx.json({
			session_identifier: sessionIdentifier,
			// Relative, so refreshes stay on the origin that registered.
			refresh_url: authPath(ctx, REFRESH_PATH),
			scope: { include_site: false },
			credentials: [
				{
					type: "cookie",
					name: cookie.name,
					attributes: serializeCookieAttributes(cookie.name, cookie.attributes),
				},
			],
			allowed_refresh_initiators: toRefreshInitiators(
				ctx.context.trustedOrigins,
				new URL(ctx.context.baseURL).hostname,
			),
		});
	}

	async function requestProof(
		ctx: GenericEndpointContext,
		sessionId: string,
		sessionIdentifier: string,
	) {
		const challenge = await issueChallenge(
			ctx,
			challengeIdentifier,
			sessionId,
			CHALLENGE_TTL_SECONDS,
		);
		return new Response(null, {
			status: 403,
			headers: {
				[CHALLENGE_HEADER]: serializeChallengeHeader({
					challenge,
					sessionIdentifier,
				}),
				"cache-control": "no-store",
			},
		});
	}

	function offerRegistration(ctx: GenericEndpointContext, challenge: string) {
		ctx.setHeader(
			REGISTRATION_HEADER,
			serializeRegistrationHeader({
				path: authPath(ctx, REGISTER_PATH),
				challenge,
			}),
		);
	}

	return {
		id: "dbsc",
		version: PACKAGE_VERSION,
		init(ctx) {
			const advanced = ctx.options.advanced;
			if (!ctx.options.database && !ctx.options.secondaryStorage) {
				throw new BetterAuthError(
					"dbsc: a database or secondary storage is required, because device keys are stored with the session.",
				);
			}
			if (advanced?.crossSubDomainCookies?.enabled) {
				throw new BetterAuthError(
					"dbsc: crossSubDomainCookies is not supported yet.",
				);
			}
			if (advanced?.defaultCookieAttributes?.partitioned) {
				throw new BetterAuthError(
					"dbsc: partitioned cookies cannot be device-bound.",
				);
			}
			return {
				options: {
					databaseHooks: {
						session: {
							create: {
								// A new session has a new id and token, which a key registered
								// for the session it replaces cannot refresh.
								async before(session) {
									if (session.dbscPublicKey == null) return;
									return { data: { ...session, dbscPublicKey: null } };
								},
								async after(session) {
									const tokens = await createdSessionTokens
										.get()
										.catch(() => null);
									tokens?.add(session.token);
								},
							},
						},
					},
				},
			};
		},
		schema: mergeSchema(schema, options?.schema),
		async validateSession({ session }, ctx) {
			if (session.dbscPublicKey == null) return true;
			return hasValidBoundCookie(ctx, session.id);
		},
		endpoints: {
			/**
			 * ### Endpoint
			 *
			 * POST `/dbsc/register`
			 *
			 * Called by the browser, not by app code, to register the device key
			 * for a session it was offered registration for.
			 */
			registerDeviceBoundSession: createAuthEndpoint(
				REGISTER_PATH,
				PROTOCOL_ENDPOINT_OPTIONS,
				async (ctx) => {
					const invalid = () =>
						APIError.from("BAD_REQUEST", DBSC_ERROR_CODES.INVALID_REGISTRATION);
					const proof = readHeaderString(ctx.headers.get(RESPONSE_HEADER));
					const registration = proof && (await verifyRegistrationProof(proof));
					if (!registration) throw invalid();
					const offer =
						await ctx.context.internalAdapter.consumeVerificationValue(
							registrationIdentifier(registration.jti),
						);
					if (!offer) throw invalid();
					const found = await ctx.context.internalAdapter.findSession(
						offer.value,
					);
					if (!found || found.session.expiresAt < new Date()) throw invalid();
					if (found.session.dbscPublicKey != null) {
						throw APIError.from(
							"BAD_REQUEST",
							DBSC_ERROR_CODES.SESSION_ALREADY_BOUND,
						);
					}
					const session: (Session & { dbscPublicKey?: unknown }) | null =
						await ctx.context.internalAdapter.updateSession(
							found.session.token,
							{ dbscPublicKey: JSON.stringify(registration.publicKey) },
						);
					// Never report a registration whose key was not saved.
					if (!session?.dbscPublicKey) throw invalid();
					const dontRememberMe = await ctx.getSignedCookie(
						ctx.context.authCookies.dontRememberToken.name,
						ctx.context.secret,
					);
					// Replace a cached copy that predates the key.
					await setCookieCache(
						ctx,
						{ session, user: found.user },
						!!dontRememberMe,
					);
					return sessionInstructions(
						ctx,
						session,
						await symmetricEncrypt({
							key: ctx.context.secretConfig,
							data: session.token,
						}),
					);
				},
			),
			/**
			 * ### Endpoint
			 *
			 * POST `/dbsc/refresh`
			 *
			 * Called by the browser, not by app code, to renew the bound cookie
			 * by signing a challenge with the device key.
			 */
			refreshDeviceBoundSession: createAuthEndpoint(
				REFRESH_PATH,
				PROTOCOL_ENDPOINT_OPTIONS,
				async (ctx) => {
					const sessionIdentifier = readHeaderString(
						ctx.headers.get(SESSION_ID_HEADER),
					);
					if (!sessionIdentifier) {
						throw APIError.fromStatus("BAD_REQUEST");
					}
					const token = await symmetricDecrypt({
						key: ctx.context.secretConfig,
						data: sessionIdentifier,
					}).catch(() => null);
					const found = token
						? await ctx.context.internalAdapter.findSession(token)
						: null;
					const publicKey = parseStoredPublicKey(found?.session.dbscPublicKey);
					if (!found || !publicKey || found.session.expiresAt < new Date()) {
						// Ends the browser's session; Chrome checks the id first.
						return ctx.json({
							session_identifier: sessionIdentifier,
							continue: false,
						});
					}
					const proof = readHeaderString(ctx.headers.get(RESPONSE_HEADER));
					const challenge = proof
						? await verifyRefreshProof(proof, publicKey)
						: null;
					const issued = challenge
						? await ctx.context.internalAdapter.consumeVerificationValue(
								challengeIdentifier(challenge),
							)
						: null;
					if (issued?.value !== found.session.id) {
						// Any other 4xx would make Chrome end the session.
						return requestProof(ctx, found.session.id, sessionIdentifier);
					}
					return sessionInstructions(ctx, found.session, sessionIdentifier);
				},
			),
		},
		hooks: {
			after: [
				{
					matcher: (context) => !context.path?.startsWith("/dbsc/"),
					handler: createAuthMiddleware(async (ctx) => {
						const fetchSite = ctx.headers?.get("sec-fetch-site");
						// Requests without it do not come from a browser.
						if (!fetchSite) return;
						const returned = ctx.context.returned;
						const canOfferHere =
							!!ctx.request &&
							(fetchSite === "same-origin" || fetchSite === "same-site") &&
							!(isAPIError(returned) && returned.status === "FOUND");
						const pendingCookie = ctx.context.createAuthCookie(
							"dbsc_registration",
							{ maxAge: REGISTRATION_WINDOW_SECONDS },
						);

						const newSession = ctx.context.newSession?.session;
						const isSignIn =
							!!newSession &&
							newSession.dbscPublicKey == null &&
							!newSession.impersonatedBy &&
							(await createdSessionTokens.get()).has(newSession.token);
						if (isSignIn) {
							const challenge = await issueChallenge(
								ctx,
								registrationIdentifier,
								newSession.token,
								REGISTRATION_WINDOW_SECONDS,
							);
							if (canOfferHere) {
								offerRegistration(ctx, challenge);
								return;
							}
							// Redirects and server-side sign-ins cannot carry the offer to
							// the browser; the next same-site request picks it up.
							await ctx.setSignedCookie(
								pendingCookie.name,
								challenge,
								ctx.context.secret,
								pendingCookie.attributes,
							);
							return;
						}

						if (!canOfferHere) return;
						const pending = await ctx.getSignedCookie(
							pendingCookie.name,
							ctx.context.secret,
						);
						if (!pending) return;
						offerRegistration(ctx, pending);
						expireCookie(ctx, pendingCookie);
					}),
				},
			],
		},
		rateLimit: [
			{
				pathMatcher: (path) => path.startsWith("/dbsc/"),
				window: 60,
				max: 120,
			},
		],
		$ERROR_CODES: DBSC_ERROR_CODES,
		options,
	} satisfies BetterAuthPlugin;
};
