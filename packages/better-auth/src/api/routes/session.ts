import { APIError } from "better-call";
import { createAuthEndpoint, createAuthMiddleware } from "../call";
import { getDate } from "../../utils/date";
import { deleteSessionCookie, setSessionCookie } from "../../cookies";
import { z } from "zod";
import type {
	BetterAuthOptions,
	GenericEndpointContext,
	InferSession,
	InferUser,
	Prettify,
	Session,
	User,
} from "../../types";
import { hmac } from "../../crypto/hash";
import { safeJSONParse } from "../../utils/json";

export const getSession = <Option extends BetterAuthOptions>() =>
	createAuthEndpoint(
		"/get-session",
		{
			method: "GET",
			query: z.optional(
				z.object({
					/**
					 * If cookie cache is enabled, it will disable the cache
					 * and fetch the session from the database
					 */
					disableCookieCache: z
						.boolean({
							description:
								"Disable cookie cache and fetch session from database",
						})
						.optional(),
				}),
			),
			requireHeaders: true,
			metadata: {
				openapi: {
					description: "Get the current session",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											session: {
												type: "object",
												properties: {
													token: {
														type: "string",
													},
													userId: {
														type: "string",
													},
													expiresAt: {
														type: "string",
													},
												},
											},
											user: {
												type: "object",
												$ref: "#/components/schemas/User",
											},
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
				const sessionCookieToken = await ctx.getSignedCookie(
					ctx.context.authCookies.sessionToken.name,
					ctx.context.secret,
				);

				if (!sessionCookieToken) {
					return ctx.json(null);
				}

				const sessionDataCookie = ctx.getCookie(
					ctx.context.authCookies.sessionData.name,
				);
				const sessionDataPayload = sessionDataCookie
					? safeJSONParse<{
							session: {
								session: Session;
								user: User;
							};
							signature: string;
							expiresAt: number;
						}>(Buffer.from(sessionDataCookie, "base64").toString())
					: null;
				if (sessionDataPayload) {
					const isValid = await hmac.verify({
						value: JSON.stringify(sessionDataPayload.session),
						signature: sessionDataPayload?.signature,
						secret: ctx.context.secret,
					});
					if (!isValid) {
						deleteSessionCookie(ctx);
						return ctx.json(null);
					}
				}

				const dontRememberMe = await ctx.getSignedCookie(
					ctx.context.authCookies.dontRememberToken.name,
					ctx.context.secret,
				);
				/**
				 * If session data is present in the cookie, return it
				 */
				if (
					sessionDataPayload?.session &&
					ctx.context.options.session?.cookieCache?.enabled &&
					!ctx.query?.disableCookieCache
				) {
					const session = sessionDataPayload.session;
					const hasExpired =
						sessionDataPayload.expiresAt < Date.now() ||
						session.session.expiresAt < new Date();
					if (!hasExpired) {
						return ctx.json(
							session as {
								session: InferSession<Option>;
								user: InferUser<Option>;
							},
						);
					} else {
						const dataCookie = ctx.context.authCookies.sessionData.name;
						ctx.setCookie(dataCookie, "", {
							maxAge: 0,
						});
					}
				}

				const session =
					await ctx.context.internalAdapter.findSession(sessionCookieToken);

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
				 */
				if (dontRememberMe) {
					return ctx.json(
						session as unknown as {
							session: InferSession<Option>;
							user: InferUser<Option>;
						},
					);
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

				if (shouldBeUpdated) {
					const updatedSession =
						await ctx.context.internalAdapter.updateSession(
							session.session.token,
							{
								expiresAt: getDate(ctx.context.sessionConfig.expiresIn, "sec"),
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
					return ctx.json({
						session: updatedSession,
						user: session.user,
					} as unknown as {
						session: InferSession<Option>;
						user: InferUser<Option>;
					});
				}

				return ctx.json(
					session as unknown as {
						session: InferSession<Option>;
						user: InferUser<Option>;
					},
				);
			} catch (error) {
				ctx.context.logger.error("INTERNAL_SERVER_ERROR", error);
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: "internal server error",
				});
			}
		},
	);

export const getSessionFromCtx = async <
	U extends Record<string, any> = Record<string, any>,
	S extends Record<string, any> = Record<string, any>,
>(
	ctx: GenericEndpointContext,
) => {
	if (ctx.context.session) {
		return ctx.context.session as {
			session: S & Session;
			user: U & User;
		};
	}
	const session = await getSession()({
		...ctx,
		_flag: "json",
		headers: ctx.headers!,
	});
	ctx.context.session = session;
	return session as {
		session: S & Session;
		user: U & User;
	} | null;
};

export const sessionMiddleware = createAuthMiddleware(async (ctx) => {
	const session = await getSessionFromCtx(ctx);
	if (!session?.session) {
		throw new APIError("UNAUTHORIZED");
	}

	return {
		session,
	};
});

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
	const sessionAge = session.session.createdAt.valueOf();
	const now = Date.now();
	const isFresh = sessionAge + freshAge * 1000 > now;
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
			use: [sessionMiddleware],
			requireHeaders: true,
			metadata: {
				openapi: {
					description: "List all active sessions for the user",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "array",
										items: {
											type: "object",
											properties: {
												token: {
													type: "string",
												},
												userId: {
													type: "string",
												},
												expiresAt: {
													type: "string",
												},
											},
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
			const sessions = await ctx.context.internalAdapter.listSessions(
				ctx.context.session.user.id,
			);
			const activeSessions = sessions.filter((session) => {
				return session.expiresAt > new Date();
			});
			return ctx.json(
				activeSessions as unknown as Prettify<InferSession<Option>>[],
			);
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
			token: z.string({
				description: "The token to revoke",
			}),
		}),
		use: [sessionMiddleware],
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
									},
								},
								required: ["token"],
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		const token = ctx.body.token;
		const findSession = await ctx.context.internalAdapter.findSession(token);
		if (!findSession) {
			throw new APIError("BAD_REQUEST", {
				message: "Session not found",
			});
		}
		if (findSession.session.userId !== ctx.context.session.user.id) {
			throw new APIError("UNAUTHORIZED");
		}
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
		use: [sessionMiddleware],
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
		use: [sessionMiddleware],
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
										},
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
