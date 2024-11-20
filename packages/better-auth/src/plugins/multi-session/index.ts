import { z } from "zod";
import {
	APIError,
	createAuthEndpoint,
	createAuthMiddleware,
	sessionMiddleware,
} from "../../api";
import {
	deleteSessionCookie,
	parseCookies,
	parseSetCookieHeader,
	setSessionCookie,
} from "../../cookies";
import type { BetterAuthPlugin } from "../../types";
import { returnHookResponse } from "../../utils/plugin-helper";

interface MultiSessionConfig {
	/**
	 * The maximum number of sessions a user can have
	 * at a time
	 * @default 5
	 */
	maximumSessions?: number;
}

export const multiSession = (options?: MultiSessionConfig) => {
	const opts = {
		maximumSessions: 5,
		...options,
	};

	const isMultiSessionCookie = (key: string) => key.includes("_multi-");

	return {
		id: "multi-session",
		endpoints: {
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

					const sessionIds = (
						await Promise.all(
							Object.entries(cookies)
								.filter(([key]) => isMultiSessionCookie(key))
								.map(
									async ([key]) =>
										await ctx.getSignedCookie(key, ctx.context.secret),
								),
						)
					).filter((v) => v !== undefined);
					if (!sessionIds.length) return ctx.json([]);
					const sessions =
						await ctx.context.internalAdapter.findSessions(sessionIds);

					const validSessions = sessions.filter(
						(session) => session && session.session.expiresAt > new Date(),
					);

					return ctx.json(validSessions);
				},
			),
			setActiveSession: createAuthEndpoint(
				"/multi-session/set-active",
				{
					method: "POST",
					body: z.object({
						sessionId: z.string(),
					}),
					requireHeaders: true,
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const sessionId = ctx.body.sessionId;
					const multiSessionCookieName = `${ctx.context.authCookies.sessionToken.name}_multi-${sessionId}`;
					const sessionCookie = await ctx.getSignedCookie(
						multiSessionCookieName,
						ctx.context.secret,
					);
					if (!sessionCookie) {
						throw new APIError("UNAUTHORIZED", {
							message: "Invalid session id",
						});
					}
					const session =
						await ctx.context.internalAdapter.findSession(sessionId);
					if (!session || session.session.expiresAt < new Date()) {
						ctx.setCookie(multiSessionCookieName, "", {
							...ctx.context.authCookies.sessionToken.options,
							maxAge: 0,
						});
						throw new APIError("UNAUTHORIZED", {
							message: "Invalid session id",
						});
					}
					await setSessionCookie(ctx, session);
					return ctx.json(session);
				},
			),
			revokeDeviceSession: createAuthEndpoint(
				"/multi-session/revoke",
				{
					method: "POST",
					body: z.object({
						sessionId: z.string(),
					}),
					requireHeaders: true,
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const sessionId = ctx.body.sessionId;
					const multiSessionCookieName = `${ctx.context.authCookies.sessionToken.name}_multi-${sessionId}`;
					const sessionCookie = await ctx.getSignedCookie(
						multiSessionCookieName,
						ctx.context.secret,
					);
					if (!sessionCookie) {
						throw new APIError("UNAUTHORIZED", {
							message: "Invalid session id",
						});
					}

					await ctx.context.internalAdapter.deleteSession(sessionId);
					ctx.setCookie(multiSessionCookieName, "", {
						...ctx.context.authCookies.sessionToken.options,
						maxAge: 0,
					});
					const isActive = ctx.context.session?.session.token === sessionId;
					if (!isActive) return ctx.json({ success: true });

					const cookieHeader = ctx.headers?.get("cookie");
					if (cookieHeader) {
						const cookies = Object.fromEntries(parseCookies(cookieHeader));

						const sessionIds = (
							await Promise.all(
								Object.entries(cookies)
									.filter(([key]) => isMultiSessionCookie(key))
									.map(
										async ([key]) =>
											await ctx.getSignedCookie(key, ctx.context.secret),
									),
							)
						).filter((v): v is string => v !== undefined);
						const internalAdapter = ctx.context.internalAdapter;

						if (sessionIds.length > 0) {
							const sessions = await internalAdapter.findSessions(sessionIds);
							const validSessions = sessions.filter(
								(session) => session && session.session.expiresAt > new Date(),
							);

							if (validSessions.length > 0) {
								const nextSession = validSessions[0];
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
						success: true,
					});
				},
			),
		},
		hooks: {
			after: [
				{
					matcher: () => true,
					handler: createAuthMiddleware(async (ctx) => {
						if (
							!ctx.context.returned ||
							!(ctx.context.returned instanceof Response)
						)
							return;

						const cookieString = ctx.context.returned.headers.get("set-cookie");
						if (!cookieString) return;

						const setCookies = parseSetCookieHeader(cookieString);
						const sessionCookieConfig = ctx.context.authCookies.sessionToken;
						const sessionToken = setCookies.get(
							sessionCookieConfig.name,
						)?.value;
						if (!sessionToken) return;

						const cookies = parseCookies(ctx.headers?.get("cookie") || "");
						const rawSession = sessionToken.split(".")[0];
						const cookieName = `${sessionCookieConfig.name}_multi-${rawSession}`;

						if (setCookies.get(cookieName) || cookies.get(cookieName)) return;

						const currentMultiSessions =
							Object.keys(Object.fromEntries(cookies)).filter(
								isMultiSessionCookie,
							).length + (cookieString.includes("session_token") ? 1 : 0);

						if (currentMultiSessions > opts.maximumSessions) {
							return;
						}

						await ctx.setSignedCookie(
							cookieName,
							rawSession,
							ctx.context.secret,
							sessionCookieConfig.options,
						);
						const response = ctx.context.returned;
						response.headers.append(
							"Set-Cookie",
							ctx.responseHeader.get("set-cookie")!,
						);

						return { response };
					}),
				},
				{
					matcher: (context) => context.path === "/sign-out",
					handler: createAuthMiddleware(async (ctx) => {
						const cookieHeader = ctx.headers?.get("cookie");
						if (!cookieHeader) return;
						const cookies = Object.fromEntries(parseCookies(cookieHeader));
						const ids = Object.keys(cookies)
							.map((key) => {
								if (isMultiSessionCookie(key)) {
									ctx.setCookie(key, "", { maxAge: 0 });
									const id = key.split("_multi-")[1];
									return id;
								}
								return null;
							})
							.filter((v): v is string => v !== null);
						await ctx.context.internalAdapter.deleteSessions(ids);
						const response = ctx.context.returned;
						if (response instanceof Response) {
							console.log("response", ctx.responseHeader.get("set-cookie"));
							response.headers.append(
								"Set-Cookie",
								ctx.responseHeader.get("set-cookie")!,
							);
							return { response };
						}
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
