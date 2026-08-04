import type {
	BetterAuthOptions,
	GenericEndpointContext,
} from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { safeJSONParse } from "@better-auth/core/utils/json";
import { base64Url } from "@better-auth/utils/base64";
import { binary } from "@better-auth/utils/binary";
import { createHMAC } from "@better-auth/utils/hmac";

import * as z from "zod";
import { hasServerSessionStore } from "../../context/store-capabilities";
import {
	deleteSessionCookie,
	expireCookie,
	getChunkedCookie,
	setCookieCache,
	setSessionCookie,
} from "../../cookies";
import { getSessionQuerySchema } from "../../cookies/session-store";
import { symmetricDecodeJWT, verifyJWT } from "../../crypto";
import { parseSessionOutput, parseUserOutput } from "../../db";
import type { Prettify, Session, User } from "../../types";
import { getDate } from "../../utils/date";
import { isAPIError } from "../../utils/is-api-error";

type SessionEndpointMode = "read" | "refresh";

type SessionEndpointResponse<Option extends BetterAuthOptions> = {
	session: Session<Option["session"], Option["plugins"]>;
	user: User<Option["user"], Option["plugins"]>;
	needsRefresh?: true;
};

const createSessionHandler =
	<Option extends BetterAuthOptions>(mode: SessionEndpointMode) =>
	async (
		ctx: GenericEndpointContext,
	): Promise<SessionEndpointResponse<Option> | null> => {
		ctx.setHeader("cache-control", "no-store");
		ctx.setHeader("pragma", "no-cache");

		const refreshRequested = mode === "refresh";

		try {
			const sessionCookieToken = await ctx.getSignedCookie(
				ctx.context.authCookies.sessionToken.name,
				ctx.context.secret,
			);

			if (!sessionCookieToken) {
				return null;
			}

			const sessionDataCookie = getChunkedCookie(
				ctx,
				ctx.context.authCookies.sessionData.name,
			);

			let sessionDataPayload: {
				session: {
					session: Session;
					user: User;
					updatedAt: number;
					version?: string;
				};
				expiresAt: number;
			} | null = null;
			const cookieCacheNeedsRefresh =
				!!ctx.context.options.session?.cookieCache?.enabled &&
				!ctx.query?.disableCookieCache;

			if (sessionDataCookie) {
				const strategy =
					ctx.context.options.session?.cookieCache?.strategy || "compact";

				if (strategy === "jwe") {
					// Decode JWE (encrypted)
					const payload = await symmetricDecodeJWT<{
						session: Session;
						user: User;
						updatedAt: number;
						version?: string;
						exp?: number;
					}>(
						sessionDataCookie,
						ctx.context.secretConfig,
						"better-auth-session",
					);

					if (payload && payload.session && payload.user) {
						sessionDataPayload = {
							session: {
								session: payload.session,
								user: payload.user,
								updatedAt: payload.updatedAt,
								version: payload.version,
							},
							expiresAt: payload.exp ? payload.exp * 1000 : Date.now(),
						};
					} else {
						// Decryption failed, expire the invalid cookie and fall through
						// to session_token DB validation. This handles scenarios like
						// cross-subdomain cookie migrations where stale cookies may be present.
						if (refreshRequested) {
							expireCookie(ctx, ctx.context.authCookies.sessionData);
						}
					}
				} else if (strategy === "jwt") {
					// Decode JWT (signed with HMAC, not encrypted)
					const payload = await verifyJWT<{
						session: Session;
						user: User;
						updatedAt: number;
						version?: string;
						exp?: number;
					}>(sessionDataCookie, ctx.context.secret);

					if (payload && payload.session && payload.user) {
						sessionDataPayload = {
							session: {
								session: payload.session,
								user: payload.user,
								updatedAt: payload.updatedAt,
								version: payload.version,
							},
							expiresAt: payload.exp ? payload.exp * 1000 : Date.now(),
						};
					} else {
						// Verification failed, expire the invalid cookie and fall through
						// to session_token DB validation. This handles scenarios like
						// cross-subdomain cookie migrations where stale cookies may be present.
						if (refreshRequested) {
							expireCookie(ctx, ctx.context.authCookies.sessionData);
						}
					}
				} else {
					// Decode compact format (or legacy base64-hmac)
					const parsed = safeJSONParse<{
						session: {
							session: Session;
							user: User;
							updatedAt: number;
							version?: string;
						};
						signature: string;
						expiresAt: number;
					}>(binary.decode(base64Url.decode(sessionDataCookie)));

					if (parsed) {
						const isValid = await createHMAC(
							"SHA-256",
							"base64urlnopad",
						).verify(
							ctx.context.secret,
							JSON.stringify({
								...parsed.session,
								expiresAt: parsed.expiresAt,
							}),
							parsed.signature,
						);
						if (isValid) {
							sessionDataPayload = parsed;
						} else {
							// HMAC verification failed, expire the invalid cookie and fall through
							// to session_token DB validation. This handles scenarios like
							// cross-subdomain cookie migrations where stale cookies may be present.
							if (refreshRequested) {
								expireCookie(ctx, ctx.context.authCookies.sessionData);
							}
						}
					}
				}
			}

			const dontRememberMe = await ctx.getSignedCookie(
				ctx.context.authCookies.dontRememberToken.name,
				ctx.context.secret,
			);
			const hasDurableSessionStore = hasServerSessionStore(ctx.context.options);

			/**
			 * Stateful refreshes must use the durable store as their authority.
			 * Stateless deployments use the signed cookie as the session record.
			 */
			if (
				sessionDataPayload?.session &&
				ctx.context.options.session?.cookieCache?.enabled &&
				!ctx.query?.disableCookieCache &&
				(!refreshRequested || !hasDurableSessionStore)
			) {
				const session = sessionDataPayload.session;

				const versionConfig = ctx.context.options.session?.cookieCache?.version;
				let expectedVersion = "1";
				if (versionConfig) {
					if (typeof versionConfig === "string") {
						expectedVersion = versionConfig;
					} else if (typeof versionConfig === "function") {
						const result = versionConfig(session.session, session.user);
						expectedVersion = result instanceof Promise ? await result : result;
					}
				}

				const cookieVersion = session.version || "1";
				if (cookieVersion !== expectedVersion) {
					// Version mismatch - invalidate the cookie cache
					if (refreshRequested) {
						expireCookie(ctx, ctx.context.authCookies.sessionData);
					}
				} else {
					const cachedSessionExpiresAt = new Date(
						session.session.expiresAt as unknown as string | number | Date,
					);
					const hasExpired =
						sessionDataPayload.expiresAt < Date.now() ||
						cachedSessionExpiresAt < new Date();

					if (hasExpired) {
						// When the session data cookie has expired, delete it;
						//  then we try to fetch from DB
						if (refreshRequested) {
							expireCookie(ctx, ctx.context.authCookies.sessionData);
						}
					} else {
						const sessionRefreshDueAt =
							cachedSessionExpiresAt.valueOf() -
							ctx.context.sessionConfig.expiresIn * 1000 +
							ctx.context.sessionConfig.updateAge * 1000;
						const sessionRefreshDue =
							!dontRememberMe &&
							!ctx.context.options.session?.disableSessionRefresh &&
							!ctx.query?.disableRefresh &&
							sessionRefreshDueAt <= Date.now();
						const cookieRefreshCache =
							ctx.context.sessionConfig.cookieRefreshCache;
						const cookieRefreshDue =
							cookieRefreshCache !== false &&
							sessionDataPayload.expiresAt - Date.now() <
								cookieRefreshCache.updateAge * 1000;
						const refreshedAt = new Date();
						const refreshedSession =
							refreshRequested && sessionRefreshDue
								? {
										...session.session,
										expiresAt: getDate(
											ctx.context.sessionConfig.expiresIn,
											"sec",
										),
										updatedAt: refreshedAt,
									}
								: session.session;

						if (refreshRequested && (sessionRefreshDue || cookieRefreshDue)) {
							await setCookieCache(
								ctx,
								{
									session: refreshedSession,
									user: session.user,
								},
								!!dontRememberMe,
							);

							const sessionTokenOptions =
								ctx.context.authCookies.sessionToken.attributes;
							await ctx.setSignedCookie(
								ctx.context.authCookies.sessionToken.name,
								refreshedSession.token,
								ctx.context.secret,
								{
									...sessionTokenOptions,
									maxAge: dontRememberMe
										? undefined
										: Math.max(
												0,
												Math.floor(
													(new Date(refreshedSession.expiresAt).valueOf() -
														Date.now()) /
														1000,
												),
											),
								},
							);
						}

						const parsedSession = parseSessionOutput(ctx.context.options, {
							...refreshedSession,
							expiresAt: new Date(refreshedSession.expiresAt),
							createdAt: new Date(refreshedSession.createdAt),
							updatedAt: new Date(refreshedSession.updatedAt),
						});
						const parsedUser = parseUserOutput(ctx.context.options, {
							...session.user,
							createdAt: new Date(session.user.createdAt),
							updatedAt: new Date(session.user.updatedAt),
						});
						ctx.context.session = {
							session: parsedSession,
							user: parsedUser,
						};
						return ctx.json({
							session: parsedSession,
							user: parsedUser,
							...(!refreshRequested && (sessionRefreshDue || cookieRefreshDue)
								? { needsRefresh: true as const }
								: {}),
						} as {
							session: Session<Option["session"], Option["plugins"]>;
							user: User<Option["user"], Option["plugins"]>;
							needsRefresh?: true;
						});
					}
				}
			}

			const session =
				await ctx.context.internalAdapter.findSession(sessionCookieToken);
			ctx.context.session = session;
			if (!session || session.session.expiresAt < new Date()) {
				if (refreshRequested) {
					deleteSessionCookie(ctx);
					if (session) {
						await ctx.context.internalAdapter.deleteSession(
							session.session.token,
						);
					}
				}
				return ctx.json(null);
			}
			/**
			 * We don't need to update the session if the user doesn't want to be remembered
			 * or if the session refresh is disabled
			 */
			if (dontRememberMe || ctx.query?.disableRefresh) {
				// Parse session and user to ensure additionalFields are included
				const parsedSession = parseSessionOutput(
					ctx.context.options,
					session.session,
				);
				const parsedUser = parseUserOutput(ctx.context.options, session.user);
				return ctx.json({
					session: parsedSession,
					user: parsedUser,
				} as {
					session: Session<Option["session"], Option["plugins"]>;
					user: User<Option["user"], Option["plugins"]>;
				});
			}
			const expiresIn = ctx.context.sessionConfig.expiresIn;
			const updateAge = ctx.context.sessionConfig.updateAge;
			/**
			 * Calculate last updated date to throttle write updates to database
			 * Formula: ({expiry date} - sessionMaxAge) + sessionUpdateAge
			 *
			 * e.g. ({expiry date} - 30 days) + 1 hour
			 *
			 * inspired by: https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/lib/actions/session.ts
			 */
			const sessionIsDueToBeUpdatedDate =
				session.session.expiresAt.valueOf() -
				expiresIn * 1000 +
				updateAge * 1000;
			const shouldBeUpdated = sessionIsDueToBeUpdatedDate <= Date.now();
			const disableRefresh =
				ctx.query?.disableRefresh ||
				ctx.context.options.session?.disableSessionRefresh;
			const shouldRefresh = shouldBeUpdated && !disableRefresh;
			if (!refreshRequested) {
				const parsedSession = parseSessionOutput(
					ctx.context.options,
					session.session,
				);
				const parsedUser = parseUserOutput(ctx.context.options, session.user);
				return ctx.json({
					session: parsedSession,
					user: parsedUser,
					...(shouldRefresh || cookieCacheNeedsRefresh
						? { needsRefresh: true as const }
						: {}),
				} as {
					session: Session<Option["session"], Option["plugins"]>;
					user: User<Option["user"], Option["plugins"]>;
					needsRefresh?: true;
				});
			}

			if (shouldRefresh) {
				const updatedSession = await ctx.context.internalAdapter.updateSession(
					session.session.token,
					{
						expiresAt: getDate(ctx.context.sessionConfig.expiresIn, "sec"),
						updatedAt: new Date(),
					},
				);
				if (!updatedSession) {
					/**
					 * Handle case where session update fails (e.g., concurrent deletion)
					 */
					deleteSessionCookie(ctx);
					throw APIError.from(
						"UNAUTHORIZED",
						BASE_ERROR_CODES.FAILED_TO_GET_SESSION,
					);
				}
				const maxAge = ctx.context.sessionConfig.expiresIn;
				await setSessionCookie(
					ctx,
					{
						session: updatedSession,
						user: session.user,
					},
					false,
					{
						maxAge,
					},
				);

				// Parse session and user to ensure additionalFields are included
				const parsedUpdatedSession = parseSessionOutput(
					ctx.context.options,
					updatedSession,
				);
				const parsedUser = parseUserOutput(ctx.context.options, session.user);
				return ctx.json({
					session: parsedUpdatedSession,
					user: parsedUser,
				} as unknown as {
					session: Session<Option["session"], Option["plugins"]>;
					user: User<Option["user"], Option["plugins"]>;
				});
			}
			await setCookieCache(ctx, session, !!dontRememberMe);
			// Parse session and user to ensure additionalFields are included
			const parsedSession = parseSessionOutput(
				ctx.context.options,
				session.session,
			);
			const parsedUser = parseUserOutput(ctx.context.options, session.user);
			return ctx.json({
				session: parsedSession,
				user: parsedUser,
			} as {
				session: Session<Option["session"], Option["plugins"]>;
				user: User<Option["user"], Option["plugins"]>;
			});
		} catch (error) {
			if (isAPIError(error)) {
				throw error;
			}
			ctx.context.logger.error("INTERNAL_SERVER_ERROR", error);
			throw APIError.from(
				"INTERNAL_SERVER_ERROR",
				BASE_ERROR_CODES.FAILED_TO_GET_SESSION,
			);
		}
	};

export const getSession = <Option extends BetterAuthOptions>() =>
	createAuthEndpoint(
		"/get-session",
		{
			method: "GET",
			operationId: "getSession",
			query: getSessionQuerySchema,
			requireHeaders: true,
			metadata: {
				openapi: {
					operationId: "getSession",
					description: "Get the current session",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										// better-call's OpenAPI schema type doesn't yet model OAS 3.1 union `type`.
										type: ["object", "null"] as unknown as "object",
										properties: {
											session: {
												$ref: "#/components/schemas/Session",
											},
											user: {
												$ref: "#/components/schemas/User",
											},
											needsRefresh: {
												type: "boolean",
												description:
													"Whether the client should refresh the session through POST /refresh-session",
											},
										},
										required: ["session", "user"],
									},
								},
							},
						},
					},
				},
			},
		},
		createSessionHandler<Option>("read"),
	);

export const refreshSession = <Option extends BetterAuthOptions>() =>
	createAuthEndpoint(
		"/refresh-session",
		{
			method: "POST",
			operationId: "refreshSession",
			query: getSessionQuerySchema,
			requireHeaders: true,
			metadata: {
				openapi: {
					operationId: "refreshSession",
					description: "Refresh the current session",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										// better-call's OpenAPI schema type doesn't yet model OAS 3.1 union `type`.
										type: ["object", "null"] as unknown as "object",
										properties: {
											session: {
												$ref: "#/components/schemas/Session",
											},
											user: {
												$ref: "#/components/schemas/User",
											},
										},
										required: ["session", "user"],
									},
								},
							},
						},
					},
				},
			},
		},
		createSessionHandler<Option>("refresh"),
	);

/**
 * Whether the deployment keeps sessions in a durable server-side store
 * (a database or secondary storage) rather than only in the signed cookie.
 *
 * Sensitive operations use this to decide whether the cookie cache is merely an
 * optimization that must be bypassed for an authoritative read (`true`), or the
 * only place the session lives and therefore the authority itself (`false`, for
 * stateless / DB-less deployments). Pass the result as `disableCookieCache` so a
 * revoked-but-cached session cannot authorize a sensitive action.
 */
export const isStateful = (ctx: GenericEndpointContext): boolean =>
	hasServerSessionStore(ctx.context.options);

export const getSessionFromCtx = async <
	U extends Record<string, any> = Record<string, any>,
	S extends Record<string, any> = Record<string, any>,
>(
	ctx: GenericEndpointContext,
	config?:
		| {
				disableCookieCache?: boolean;
				disableRefresh?: boolean;
		  }
		| undefined,
) => {
	if (ctx.context.session) {
		return ctx.context.session as {
			session: S & Session;
			user: U & User;
		};
	}

	const session = await getSession()({
		...ctx,
		method: "GET",
		asResponse: false,
		headers: ctx.headers!,
		returnHeaders: true,
		returnStatus: false,
		query: {
			...config,
			...ctx.query,
			// `disableCookieCache`/`disableRefresh` only ever make validation
			// stricter, so OR the caller's intent with the request. A caller that
			// forces strict validation must not be weakened by a request query
			// param (e.g. `?disableCookieCache=`), which the plain merge would let
			// override the forced value back to false.
			disableCookieCache:
				config?.disableCookieCache || ctx.query?.disableCookieCache,
			disableRefresh: config?.disableRefresh || ctx.query?.disableRefresh,
		},
	}).catch(() => {
		return null;
	});
	if (!session) {
		ctx.context.session = null;
		return null;
	}
	if (session.headers) {
		session.headers.forEach((value, key) => {
			const lowerKey = key.toLowerCase();
			// /get-session response cache headers must not leak onto endpoints
			// that resolve the session via getSessionFromCtx.
			if (lowerKey === "cache-control" || lowerKey === "pragma") {
				return;
			}
			if (!ctx.context.responseHeaders) {
				ctx.context.responseHeaders = new Headers({ [key]: value });
			} else if (lowerKey === "set-cookie") {
				ctx.context.responseHeaders.append(key, value);
			} else {
				ctx.context.responseHeaders.set(key, value);
			}
		});
	}
	ctx.context.session = session.response;
	return session.response as {
		session: S & Session;
		user: U & User;
	} | null;
};

/**
 * Reads the session from the source that can authorize sensitive work.
 *
 * Stateful deployments must re-read the server-side session store because an
 * earlier hook may have populated `ctx.context.session` from cookie cache.
 * Stateless deployments keep the signed cookie as the session record.
 */
export const getAuthoritativeSessionFromCtx = async <
	U extends Record<string, any> = Record<string, any>,
	S extends Record<string, any> = Record<string, any>,
>(
	ctx: GenericEndpointContext,
) => {
	if (!isStateful(ctx)) {
		return getSessionFromCtx<U, S>(ctx);
	}

	ctx.context.session = null;
	return getSessionFromCtx<U, S>(ctx, { disableCookieCache: true });
};

/**
 * The middleware forces the endpoint to require a valid session.
 */
export const sessionMiddleware = createAuthMiddleware(async (ctx) => {
	const session = await getSessionFromCtx(ctx);
	if (!session?.session) {
		throw APIError.from("UNAUTHORIZED", {
			message: "Unauthorized",
			code: "UNAUTHORIZED",
		});
	}
	return {
		session,
	};
});

/**
 * This middleware forces the endpoint to require a valid authoritative session.
 * This should be used for sensitive operations like password changes, account deletion, etc.
 */
export const sensitiveSessionMiddleware = createAuthMiddleware(async (ctx) => {
	const session = await getAuthoritativeSessionFromCtx(ctx);
	if (!session?.session) {
		throw APIError.from("UNAUTHORIZED", {
			message: "Unauthorized",
			code: "UNAUTHORIZED",
		});
	}
	return {
		session,
	};
});

/**
 * This middleware allows you to call the endpoint on the client if session is valid.
 * However, if called on the server, no session is required.
 */
export const requestOnlySessionMiddleware = createAuthMiddleware(
	async (ctx) => {
		const session = await getSessionFromCtx(ctx);
		if (!session?.session && (ctx.request || ctx.headers)) {
			throw APIError.from("UNAUTHORIZED", {
				message: "Unauthorized",
				code: "UNAUTHORIZED",
			});
		}
		return { session };
	},
);

/**
 * This middleware forces the endpoint to require a valid session,
 * as well as making sure the session is fresh before proceeding.
 *
 * Session freshness check will be skipped if the session config's freshAge
 * is set to 0
 */
export const freshSessionMiddleware = createAuthMiddleware(async (ctx) => {
	const session = await getSessionFromCtx(ctx);
	if (!session?.session) {
		throw APIError.from("UNAUTHORIZED", {
			message: "Unauthorized",
			code: "UNAUTHORIZED",
		});
	}
	if (ctx.context.sessionConfig.freshAge !== 0) {
		const createdAt = new Date(session.session.createdAt).getTime();
		const freshAge = ctx.context.sessionConfig.freshAge * 1000;
		if (Date.now() - createdAt >= freshAge) {
			throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.SESSION_NOT_FRESH);
		}
	}
	return {
		session,
	};
});
/**
 * user active sessions list
 */
export const listSessions = <Option extends BetterAuthOptions>() =>
	createAuthEndpoint(
		"/list-sessions",
		{
			method: "GET",
			operationId: "listUserSessions",
			use: [freshSessionMiddleware],
			requireHeaders: true,
			metadata: {
				openapi: {
					operationId: "listUserSessions",
					description: "List all active sessions for the user",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "array",
										items: {
											$ref: "#/components/schemas/Session",
										},
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			try {
				const sessions = await ctx.context.internalAdapter.listSessions(
					ctx.context.session.user.id,
					{ onlyActiveSessions: true },
				);
				const activeSessions = sessions.filter((session) => {
					return session.expiresAt > new Date();
				});
				return ctx.json(
					activeSessions.map((session) =>
						parseSessionOutput(ctx.context.options, session),
					) as unknown as Prettify<
						Session<Option["session"], Option["plugins"]>
					>[],
				);
			} catch (e: any) {
				ctx.context.logger.error(e);
				throw ctx.error("INTERNAL_SERVER_ERROR");
			}
		},
	);

/**
 * revoke a single session
 */
export const revokeSession = createAuthEndpoint(
	"/revoke-session",
	{
		method: "POST",
		body: z.object({
			token: z.string().meta({
				description: "The token to revoke",
			}),
		}),
		use: [sensitiveSessionMiddleware],
		requireHeaders: true,
		metadata: {
			openapi: {
				description: "Revoke a single session",
				requestBody: {
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									token: {
										type: "string",
										description: "The token to revoke",
									},
								},
								required: ["token"],
							},
						},
					},
				},
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										status: {
											type: "boolean",
											description:
												"Indicates if the session was revoked successfully",
										},
									},
									required: ["status"],
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		const token = ctx.body.token;
		const session = await ctx.context.internalAdapter.findSession(token);

		if (session?.session.userId === ctx.context.session.user.id) {
			try {
				await ctx.context.internalAdapter.deleteSession(token);
			} catch (error) {
				ctx.context.logger.error(
					error && typeof error === "object" && "name" in error
						? (error.name as string)
						: "",
					error,
				);
				throw APIError.from("INTERNAL_SERVER_ERROR", {
					message: "Internal Server Error",
					code: "INTERNAL_SERVER_ERROR",
				});
			}
		}
		return ctx.json({
			status: true,
		});
	},
);
/**
 * revoke all user sessions
 */
export const revokeSessions = createAuthEndpoint(
	"/revoke-sessions",
	{
		method: "POST",
		use: [sensitiveSessionMiddleware],
		requireHeaders: true,
		metadata: {
			openapi: {
				description: "Revoke all sessions for the user",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										status: {
											type: "boolean",
											description:
												"Indicates if all sessions were revoked successfully",
										},
									},
									required: ["status"],
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		try {
			await ctx.context.internalAdapter.deleteUserSessions(
				ctx.context.session.user.id,
			);
		} catch (error) {
			ctx.context.logger.error(
				error && typeof error === "object" && "name" in error
					? (error.name as string)
					: "",
				error,
			);
			throw APIError.from("INTERNAL_SERVER_ERROR", {
				message: "Internal Server Error",
				code: "INTERNAL_SERVER_ERROR",
			});
		}
		return ctx.json({
			status: true,
		});
	},
);

export const revokeOtherSessions = createAuthEndpoint(
	"/revoke-other-sessions",
	{
		method: "POST",
		requireHeaders: true,
		use: [sensitiveSessionMiddleware],
		metadata: {
			openapi: {
				description:
					"Revoke all other sessions for the user except the current one",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										status: {
											type: "boolean",
											description:
												"Indicates if all other sessions were revoked successfully",
										},
									},
									required: ["status"],
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		const session = ctx.context.session;
		if (!session.user) {
			throw APIError.from("UNAUTHORIZED", {
				message: "Unauthorized",
				code: "UNAUTHORIZED",
			});
		}
		const sessions = await ctx.context.internalAdapter.listSessions(
			session.user.id,
		);
		const activeSessions = sessions.filter((session) => {
			return session.expiresAt > new Date();
		});
		const otherSessions = activeSessions.filter(
			(session) => session.token !== ctx.context.session.session.token,
		);
		await Promise.all(
			otherSessions.map((session) =>
				ctx.context.internalAdapter.deleteSession(session.token),
			),
		);
		return ctx.json({
			status: true,
		});
	},
);
