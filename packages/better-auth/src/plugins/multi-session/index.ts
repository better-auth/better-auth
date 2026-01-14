import type { BetterAuthPlugin } from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import * as z from "zod";
import { APIError, sessionMiddleware } from "../../api";
import {
	deleteSessionCookie,
	parseCookies,
	parseSetCookieHeader,
	setSessionCookie,
} from "../../cookies";

declare module "@better-auth/core" {
	// biome-ignore lint/correctness/noUnusedVariables: Auth and Context need to be same as declared in the module
	interface BetterAuthPluginRegistry<Auth, Context> {
		"multi-session": {
			creator: typeof multiSession;
		};
	}
}

export interface MultiSessionConfig {
	/**
	 * The maximum number of sessions a user can have
	 * at a time
	 * @default 5
	 */
	maximumSessions?: number | undefined;
}

import { MULTI_SESSION_ERROR_CODES as ERROR_CODES } from "./error-codes";

export { MULTI_SESSION_ERROR_CODES as ERROR_CODES } from "./error-codes";

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

					// Also get the active session token from the main session cookie
					const activeSessionToken = await ctx.getSignedCookie(
						ctx.context.authCookies.sessionToken.name,
						ctx.context.secret,
					);

					// Include active session token if not already in the list
					if (
						activeSessionToken &&
						!sessionTokens.includes(activeSessionToken)
					) {
						sessionTokens.push(activeSessionToken);
					}

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
					const sessionCookieConfig = ctx.context.authCookies.sessionToken;
					const multiSessionCookieName = `${
						sessionCookieConfig.name
					}_multi-${sessionToken.toLowerCase()}`;
					const sessionCookie = await ctx.getSignedCookie(
						multiSessionCookieName,
						ctx.context.secret,
					);

					const activeSessionToken = await ctx.getSignedCookie(
						sessionCookieConfig.name,
						ctx.context.secret,
					);
					const isCurrentActiveSession = activeSessionToken === sessionToken;

					if (!sessionCookie && !isCurrentActiveSession) {
						throw APIError.from(
							"UNAUTHORIZED",
							ERROR_CODES.INVALID_SESSION_TOKEN,
						);
					}
					const session =
						await ctx.context.internalAdapter.findSession(sessionToken);
					if (!session || session.session.expiresAt < new Date()) {
						if (sessionCookie) {
							ctx.setCookie(multiSessionCookieName, "", {
								...sessionCookieConfig.options,
								maxAge: 0,
							});
						}
						throw APIError.from(
							"UNAUTHORIZED",
							ERROR_CODES.INVALID_SESSION_TOKEN,
						);
					}

					if (activeSessionToken && activeSessionToken !== sessionToken) {
						const currentMultiCookieName = `${
							sessionCookieConfig.name
						}_multi-${activeSessionToken.toLowerCase()}`;
						const hasMultiCookie = await ctx.getSignedCookie(
							currentMultiCookieName,
							ctx.context.secret,
						);
						if (!hasMultiCookie) {
							await ctx.setSignedCookie(
								currentMultiCookieName,
								activeSessionToken,
								ctx.context.secret,
								sessionCookieConfig.options,
							);
						}
					}

					if (!sessionCookie) {
						await ctx.setSignedCookie(
							multiSessionCookieName,
							sessionToken,
							ctx.context.secret,
							sessionCookieConfig.options,
						);
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
					const sessionCookieConfig = ctx.context.authCookies.sessionToken;
					const multiSessionCookieName = `${
						sessionCookieConfig.name
					}_multi-${sessionToken.toLowerCase()}`;
					const sessionCookie = await ctx.getSignedCookie(
						multiSessionCookieName,
						ctx.context.secret,
					);

					const activeSessionToken = await ctx.getSignedCookie(
						sessionCookieConfig.name,
						ctx.context.secret,
					);
					const isCurrentActiveSession = activeSessionToken === sessionToken;

					if (!sessionCookie && !isCurrentActiveSession) {
						throw APIError.from(
							"UNAUTHORIZED",
							ERROR_CODES.INVALID_SESSION_TOKEN,
						);
					}

					await ctx.context.internalAdapter.deleteSession(sessionToken);

					if (sessionCookie) {
						ctx.setCookie(multiSessionCookieName, "", {
							...sessionCookieConfig.options,
							maxAge: 0,
						});
					}

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
						).filter(
							(v) => typeof v === "string" && v !== sessionToken,
						) as string[];
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
						const newSession = ctx.context.newSession;
						const sessionToken = newSession?.session.token;
						if (!sessionToken) return;
						const cookies = parseCookies(ctx.headers?.get("cookie") || "");

						const cookieName = `${
							sessionCookieConfig.name
						}_multi-${sessionToken.toLowerCase()}`;

						if (setCookies.get(cookieName) || cookies.get(cookieName)) return;

						const newUserId = newSession.user.id;
						const existingMultiSessionCookies = Object.keys(
							Object.fromEntries(cookies),
						).filter(isMultiSessionCookie);

						const existingTokens = await Promise.all(
							existingMultiSessionCookies.map(async (key) => {
								const token = await ctx.getSignedCookie(
									key,
									ctx.context.secret,
								);
								return { key, token };
							}),
						);

						const validTokens = existingTokens.filter(
							(t) => t.token !== null,
						) as { key: string; token: string }[];

						let removedDuplicateForSameUser = false;
						if (validTokens.length > 0) {
							const existingSessions =
								await ctx.context.internalAdapter.findSessions(
									validTokens.map((t) => t.token),
								);

							for (const existing of existingSessions) {
								if (existing && existing.user.id === newUserId) {
									const oldCookieEntry = validTokens.find(
										(t) => t.token === existing.session.token,
									);
									if (oldCookieEntry) {
										ctx.setCookie(
											oldCookieEntry.key
												.toLowerCase()
												.replace("__secure-", "__Secure-"),
											"",
											{
												...sessionCookieConfig.options,
												maxAge: 0,
											},
										);
										removedDuplicateForSameUser = true;
									}
								}
							}
						}

						// Count unique user sessions
						// If we removed a duplicate for the same user, we have one less slot taken
						const currentMultiSessions = removedDuplicateForSameUser
							? existingMultiSessionCookies.length - 1
							: existingMultiSessionCookies.length;

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
		options,
		$ERROR_CODES: ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
