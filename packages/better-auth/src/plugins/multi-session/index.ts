import type { BetterAuthPlugin } from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import { defineErrorCodes } from "@better-auth/core/utils";
import * as z from "zod";
import { APIError, sessionMiddleware } from "../../api";
import {
	deleteSessionCookie,
	parseCookies,
	parseSetCookieHeader,
	setSessionCookie,
} from "../../cookies";

export interface MultiSessionConfig {
	/**
	 * The maximum number of sessions a user can have
	 * at a time
	 * @default 5
	 */
	maximumSessions?: number | undefined;
}

const ERROR_CODES = defineErrorCodes({
	INVALID_SESSION_TOKEN: "Invalid session token",
});

const setActiveSessionBodySchema = z.object({
	sessionToken: z.string().meta({
		description: "The session token to set as active",
	}),
});

const revokeDeviceSessionBodySchema = z.object({
	sessionToken: z.string().meta({
		description: "The session token to revoke",
	}),
});

export const multiSession = (options?: MultiSessionConfig | undefined) => {
	const opts = {
		maximumSessions: 5,
		...options,
	};

	const isMultiSessionCookie = (key: string) => key.includes("_multi-");

	return {
		id: "multi-session",
		endpoints: {
			/**
			 * ### Endpoint
			 *
			 * GET `/multi-session/list-device-sessions`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.listDeviceSessions`
			 *
			 * **client:**
			 * `authClient.multiSession.listDeviceSessions`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/multi-session#api-method-multi-session-list-device-sessions)
			 */
			listDeviceSessions: createAuthEndpoint(
				"/multi-session/list-device-sessions",
				{
					method: "GET",
					requireHeaders: true,
				},
				async (ctx) => {
					const cookieHeader = ctx.headers?.get("cookie");
					if (!cookieHeader) return ctx.json([]);

					const cookies = Object.fromEntries(parseCookies(cookieHeader));
					const sessionTokens = (
						await Promise.all(
							Object.entries(cookies)
								.filter(([key]) => isMultiSessionCookie(key))
								.map(
									async ([key]) =>
										await ctx.getSignedCookie(key, ctx.context.secret),
								),
						)
					).filter((v) => typeof v === "string");

					if (!sessionTokens.length) return ctx.json([]);
					const sessions =
						await ctx.context.internalAdapter.findSessions(sessionTokens);
					const validSessions = sessions.filter(
						(session) => session && session.session.expiresAt > new Date(),
					);
					const uniqueUserSessions = validSessions.reduce(
						(acc, session) => {
							if (!acc.find((s) => s.user.id === session.user.id)) {
								acc.push(session);
							}
							return acc;
						},
						[] as typeof validSessions,
					);
					return ctx.json(uniqueUserSessions);
				},
			),
			/**
			 * ### Endpoint
			 *
			 * POST `/multi-session/set-active`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.setActiveSession`
			 *
			 * **client:**
			 * `authClient.multiSession.setActive`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/multi-session#api-method-multi-session-set-active)
			 */
			setActiveSession: createAuthEndpoint(
				"/multi-session/set-active",
				{
					method: "POST",
					body: setActiveSessionBodySchema,
					requireHeaders: true,
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							description: "Set the active session",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													session: {
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
				},
				async (ctx) => {
					const sessionToken = ctx.body.sessionToken;
					const multiSessionCookieName = `${
						ctx.context.authCookies.sessionToken.name
					}_multi-${sessionToken.toLowerCase()}`;
					const sessionCookie = await ctx.getSignedCookie(
						multiSessionCookieName,
						ctx.context.secret,
					);
					if (!sessionCookie) {
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_SESSION_TOKEN,
						});
					}
					const session =
						await ctx.context.internalAdapter.findSession(sessionToken);
					if (!session || session.session.expiresAt < new Date()) {
						ctx.setCookie(multiSessionCookieName, "", {
							...ctx.context.authCookies.sessionToken.options,
							maxAge: 0,
						});
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_SESSION_TOKEN,
						});
					}
					await setSessionCookie(ctx, session);
					return ctx.json(session);
				},
			),
			/**
			 * ### Endpoint
			 *
			 * POST `/multi-session/revoke`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.revokeDeviceSession`
			 *
			 * **client:**
			 * `authClient.multiSession.revoke`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/multi-session#api-method-multi-session-revoke)
			 */
			revokeDeviceSession: createAuthEndpoint(
				"/multi-session/revoke",
				{
					method: "POST",
					body: revokeDeviceSessionBodySchema,
					requireHeaders: true,
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							description: "Revoke a device session",
							responses: {
								200: {
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
					const sessionToken = ctx.body.sessionToken;
					const multiSessionCookieName = `${
						ctx.context.authCookies.sessionToken.name
					}_multi-${sessionToken.toLowerCase()}`;
					const sessionCookie = await ctx.getSignedCookie(
						multiSessionCookieName,
						ctx.context.secret,
					);
					if (!sessionCookie) {
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_SESSION_TOKEN,
						});
					}

					await ctx.context.internalAdapter.deleteSession(sessionToken);
					ctx.setCookie(multiSessionCookieName, "", {
						...ctx.context.authCookies.sessionToken.options,
						maxAge: 0,
					});
					const isActive = ctx.context.session?.session.token === sessionToken;
					if (!isActive) return ctx.json({ status: true });

					const cookieHeader = ctx.headers?.get("cookie");
					if (cookieHeader) {
						const cookies = Object.fromEntries(parseCookies(cookieHeader));

						const sessionTokens = (
							await Promise.all(
								Object.entries(cookies)
									.filter(([key]) => isMultiSessionCookie(key))
									.map(
										async ([key]) =>
											await ctx.getSignedCookie(key, ctx.context.secret),
									),
							)
						).filter((v) => typeof v === "string");
						const internalAdapter = ctx.context.internalAdapter;

						if (sessionTokens.length > 0) {
							const sessions =
								await internalAdapter.findSessions(sessionTokens);
							const validSessions = sessions.filter(
								(session) => session && session.session.expiresAt > new Date(),
							);

							if (validSessions.length > 0) {
								const nextSession = validSessions[0]!;
								await setSessionCookie(ctx, nextSession);
							} else {
								deleteSessionCookie(ctx);
							}
						} else {
							deleteSessionCookie(ctx);
						}
					} else {
						deleteSessionCookie(ctx);
					}
					return ctx.json({
						status: true,
					});
				},
			),
		},
		hooks: {
			after: [
				{
					matcher: () => true,
					handler: createAuthMiddleware(async (ctx) => {
						const cookieString = ctx.context.responseHeaders?.get("set-cookie");
						if (!cookieString) return;
						const setCookies = parseSetCookieHeader(cookieString);
						const sessionCookieConfig = ctx.context.authCookies.sessionToken;
						const sessionToken = ctx.context.newSession?.session.token;
						if (!sessionToken) return;
						const cookies = parseCookies(ctx.headers?.get("cookie") || "");

						const cookieName = `${
							sessionCookieConfig.name
						}_multi-${sessionToken.toLowerCase()}`;

						if (setCookies.get(cookieName) || cookies.get(cookieName)) return;

						const currentMultiSessions =
							Object.keys(Object.fromEntries(cookies)).filter(
								isMultiSessionCookie,
							).length + (cookieString.includes("session_token") ? 1 : 0);

						if (currentMultiSessions >= opts.maximumSessions) {
							return;
						}

						await ctx.setSignedCookie(
							cookieName,
							sessionToken,
							ctx.context.secret,
							sessionCookieConfig.options,
						);
					}),
				},
				{
					matcher: (context) => context.path === "/sign-out",
					handler: createAuthMiddleware(async (ctx) => {
						const cookieHeader = ctx.headers?.get("cookie");
						if (!cookieHeader) return;
						const cookies = Object.fromEntries(parseCookies(cookieHeader));
						const multiSessionKeys = Object.keys(cookies).filter((key) =>
							isMultiSessionCookie(key),
						);
						const verifiedTokens = (
							await Promise.all(
								multiSessionKeys.map(async (key) => {
									const verifiedToken = await ctx.getSignedCookie(
										key,
										ctx.context.secret,
									);
									if (verifiedToken) {
										ctx.setCookie(
											key.toLowerCase().replace("__secure-", "__Secure-"),
											"",
											{
												...ctx.context.authCookies.sessionToken.options,
												maxAge: 0,
											},
										);
										return verifiedToken;
									}
									return null;
								}),
							)
						).filter((v) => typeof v === "string");
						if (verifiedTokens.length > 0) {
							await ctx.context.internalAdapter.deleteSessions(verifiedTokens);
						}
					}),
				},
			],
		},
		$ERROR_CODES: ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
