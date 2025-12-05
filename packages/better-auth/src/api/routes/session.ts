import type {
	BetterAuthOptions,
	GenericEndpointContext,
} from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { safeJSONParse } from "@better-auth/core/utils";
import { base64Url } from "@better-auth/utils/base64";
import { binary } from "@better-auth/utils/binary";
import { createHMAC } from "@better-auth/utils/hmac";
import { APIError } from "better-call";
import * as z from "zod";
import {
	deleteSessionCookie,
	getChunkedCookie,
	setCookieCache,
	setSessionCookie,
} from "../../cookies";
import { getSessionQuerySchema } from "../../cookies/session-store";
import { symmetricDecodeJWT, verifyJWT } from "../../crypto";
import { parseSessionOutput, parseUserOutput } from "../../db";
import type { InferSession, InferUser, Session, User } from "../../types";
import type { Prettify } from "../../types/helper";
import { getDate } from "../../utils/date";

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
										type: "object",
										nullable: true,
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
		async (
			ctx,
		): Promise<{
			session: InferSession<Option>;
			user: InferUser<Option>;
		} | null> => {
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
						}>(sessionDataCookie, ctx.context.secret, "better-auth-session");

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
							const dataCookie = ctx.context.authCookies.sessionData.name;
							ctx.setCookie(dataCookie, "", {
								maxAge: 0,
							});
							return ctx.json(null);
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
							const dataCookie = ctx.context.authCookies.sessionData.name;
							ctx.setCookie(dataCookie, "", {
								maxAge: 0,
							});
							return ctx.json(null);
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
								const dataCookie = ctx.context.authCookies.sessionData.name;
								ctx.setCookie(dataCookie, "", {
									maxAge: 0,
								});
								return ctx.json(null);
							}
						}
					}
				}

				const dontRememberMe = await ctx.getSignedCookie(
					ctx.context.authCookies.dontRememberToken.name,
					ctx.context.secret,
				);

				/**
				 * If session data is present in the cookie, check if it should be used or refreshed
				 */
				if (
					sessionDataPayload?.session &&
					ctx.context.options.session?.cookieCache?.enabled &&
					!ctx.query?.disableCookieCache
				) {
					const session = sessionDataPayload.session;

					const versionConfig =
						ctx.context.options.session?.cookieCache?.version;
					let expectedVersion = "1";
					if (versionConfig) {
						if (typeof versionConfig === "string") {
							expectedVersion = versionConfig;
						} else if (typeof versionConfig === "function") {
							const result = versionConfig(session.session, session.user);
							expectedVersion =
								result instanceof Promise ? await result : result;
						}
					}

					const cookieVersion = session.version || "1";
					if (cookieVersion !== expectedVersion) {
						// Version mismatch - invalidate the cookie cache
						const dataCookie = ctx.context.authCookies.sessionData.name;
						ctx.setCookie(dataCookie, "", {
							maxAge: 0,
						});
					} else {
						const hasExpired =
							sessionDataPayload.expiresAt < Date.now() ||
							session.session.expiresAt < new Date();

						if (hasExpired) {
							// When the session data cookie has expired, delete it;
							//  then we try to fetch from DB
							const dataCookie = ctx.context.authCookies.sessionData.name;
							ctx.setCookie(dataCookie, "", {
								maxAge: 0,
							});
						} else {
							// Check if the cookie cache needs to be refreshed based on refreshCache
							const cookieRefreshCache =
								ctx.context.sessionConfig.cookieRefreshCache;

							if (cookieRefreshCache === false) {
								// If refreshCache is disabled, return the session from cookie as-is
								ctx.context.session = session;
								return ctx.json({
									session: session.session,
									user: session.user,
								} as {
									session: InferSession<Option>;
									user: InferUser<Option>;
								});
							}

							const timeUntilExpiry = sessionDataPayload.expiresAt - Date.now();
							const updateAge = cookieRefreshCache.updateAge * 1000; // Convert to milliseconds

							if (timeUntilExpiry < updateAge) {
								const cookieMaxAge =
									ctx.context.options.session?.cookieCache?.maxAge || 60 * 5;
								const newExpiresAt = getDate(cookieMaxAge, "sec");
								const refreshedSession = {
									session: {
										...session.session,
										expiresAt: newExpiresAt,
									},
									user: session.user,
									updatedAt: Date.now(),
								};

								// Set the refreshed cookie cache
								await setCookieCache(ctx, refreshedSession, false);

								// Parse session and user to ensure additionalFields are included
								// Rehydrate date fields from JSON strings before parsing
								const parsedRefreshedSession = parseSessionOutput(
									ctx.context.options,
									{
										...refreshedSession.session,
										expiresAt: new Date(refreshedSession.session.expiresAt),
										createdAt: new Date(refreshedSession.session.createdAt),
										updatedAt: new Date(refreshedSession.session.updatedAt),
									},
								);
								const parsedRefreshedUser = parseUserOutput(
									ctx.context.options,
									{
										...refreshedSession.user,
										createdAt: new Date(refreshedSession.user.createdAt),
										updatedAt: new Date(refreshedSession.user.updatedAt),
									},
								);
								ctx.context.session = {
									session: parsedRefreshedSession,
									user: parsedRefreshedUser,
								};
								return ctx.json({
									session: parsedRefreshedSession,
									user: parsedRefreshedUser,
								} as {
									session: InferSession<Option>;
									user: InferUser<Option>;
								});
							}

							// Parse session and user to ensure additionalFields are included
							const parsedSession = parseSessionOutput(ctx.context.options, {
								...session.session,
								expiresAt: new Date(session.session.expiresAt),
								createdAt: new Date(session.session.createdAt),
								updatedAt: new Date(session.session.updatedAt),
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
							} as {
								session: InferSession<Option>;
								user: InferUser<Option>;
							});
						}
					}
				}

				const session =
					await ctx.context.internalAdapter.findSession(sessionCookieToken);
				ctx.context.session = session;
				if (!session || session.session.expiresAt < new Date()) {
					deleteSessionCookie(ctx);
					if (session) {
						/**
						 * if session expired clean up the session
						 */
						await ctx.context.internalAdapter.deleteSession(
							session.session.token,
						);
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
						session: InferSession<Option>;
						user: InferUser<Option>;
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

				if (
					shouldBeUpdated &&
					(!ctx.query?.disableRefresh ||
						!ctx.context.options.session?.disableSessionRefresh)
				) {
					const updatedSession =
						await ctx.context.internalAdapter.updateSession(
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
						return ctx.json(null, { status: 401 });
					}
					const maxAge =
						(updatedSession.expiresAt.valueOf() - Date.now()) / 1000;
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
						session: InferSession<Option>;
						user: InferUser<Option>;
					});
				}
				await setCookieCache(ctx, session, !!dontRememberMe);
				return ctx.json(
					session as unknown as {
						session: InferSession<Option>;
						user: InferUser<Option>;
					},
				);
			} catch (error) {
				ctx.context.logger.error("INTERNAL_SERVER_ERROR", error);
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: BASE_ERROR_CODES.FAILED_TO_GET_SESSION,
				});
			}
		},
	);

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
		asResponse: false,
		headers: ctx.headers!,
		returnHeaders: false,
		returnStatus: false,
		query: {
			...config,
			...ctx.query,
		},
	}).catch((e) => {
		return null;
	});
	ctx.context.session = session;
	return session as {
		session: S & Session;
		user: U & User;
	} | null;
};

/**
 * The middleware forces the endpoint to require a valid session.
 */
export const sessionMiddleware = createAuthMiddleware(async (ctx) => {
	const session = await getSessionFromCtx(ctx);
	if (!session?.session) {
		throw new APIError("UNAUTHORIZED");
	}
	return {
		session,
	};
});

/**
 * This middleware forces the endpoint to require a valid session and ignores cookie cache.
 * This should be used for sensitive operations like password changes, account deletion, etc.
 * to ensure that revoked sessions cannot be used even if they're still cached in cookies.
 */
export const sensitiveSessionMiddleware = createAuthMiddleware(async (ctx) => {
	const session = await getSessionFromCtx(ctx, { disableCookieCache: true });
	if (!session?.session) {
		throw new APIError("UNAUTHORIZED");
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
			throw new APIError("UNAUTHORIZED");
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
		throw new APIError("UNAUTHORIZED");
	}
	if (ctx.context.sessionConfig.freshAge === 0) {
		return {
			session,
		};
	}
	const freshAge = ctx.context.sessionConfig.freshAge;
	const lastUpdated = new Date(
		session.session.updatedAt || session.session.createdAt,
	).getTime();
	const now = Date.now();
	const isFresh = now - lastUpdated < freshAge * 1000;
	if (!isFresh) {
		throw new APIError("FORBIDDEN", {
			message: "Session is not fresh",
		});
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
			use: [sessionMiddleware],
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
				);
				const activeSessions = sessions.filter((session) => {
					return session.expiresAt > new Date();
				});
				return ctx.json(
					activeSessions as unknown as Prettify<InferSession<Option>>[],
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
				throw new APIError("INTERNAL_SERVER_ERROR");
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
			await ctx.context.internalAdapter.deleteSessions(
				ctx.context.session.user.id,
			);
		} catch (error) {
			ctx.context.logger.error(
				error && typeof error === "object" && "name" in error
					? (error.name as string)
					: "",
				error,
			);
			throw new APIError("INTERNAL_SERVER_ERROR");
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
			throw new APIError("UNAUTHORIZED");
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
