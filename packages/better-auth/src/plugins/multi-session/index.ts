import { z } from "zod";
import {
	APIError,
	createAuthEndpoint,
	createAuthMiddleware,
	sessionMiddleware,
} from "../../api";
import { parseCookies, parseSetCookieHeader } from "../../cookies";
import type { BetterAuthPlugin, Session, User } from "../../types";

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
					const sessions: {
						session: Session;
						user: User;
					}[] = [];

					const sessionPromises = Object.entries(cookies)
						.filter(([key]) => isMultiSessionCookie(key))
						.map(async ([key]) => {
							const sessionId = await ctx.getSignedCookie(
								key,
								ctx.context.secret,
							);
							if (!sessionId) return null;

							const session =
								await ctx.context.internalAdapter.findSession(sessionId);
							if (!session || session.session.expiresAt <= new Date()) {
								ctx.setCookie(key, "", {
									...ctx.context.authCookies.sessionToken.options,
									maxAge: 0,
								});
								return null;
							}

							return session;
						});

					const validSessions = (await Promise.all(sessionPromises)).filter(
						Boolean,
					) as {
						session: Session;
						user: User;
					}[];

					sessions.push(
						...validSessions.filter(
							(session, index, self) =>
								index === self.findIndex((s) => s.user.id === session.user.id),
						),
					);

					return ctx.json(sessions);
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
					await ctx.setSignedCookie(
						ctx.context.authCookies.sessionToken.name,
						sessionId,
						ctx.context.secret,
						ctx.context.authCookies.sessionToken.options,
					);
					return ctx.json(session);
				},
			),
			DeviceSession: createAuthEndpoint(
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
					const session =
						await ctx.context.internalAdapter.findSession(sessionId);
					if (!session || session.session.expiresAt < new Date()) {
						ctx.setCookie(multiSessionCookieName, "", {
							...ctx.context.authCookies.sessionToken.options,
							maxAge: 0,
						});
						return ctx.json({
							success: true,
						});
					}
					await ctx.context.internalAdapter.deleteSession(sessionId);
					ctx.setCookie(multiSessionCookieName, "", {
						...ctx.context.authCookies.sessionToken.options,
						maxAge: 0,
					});
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
							Object.keys(cookies).filter(isMultiSessionCookie).length +
							(cookieString.includes("session_token") ? 1 : 0);

						if (currentMultiSessions > opts.maximumSessions) {
							throw new APIError("UNAUTHORIZED", {
								message: "Maximum number of device sessions reached.",
							});
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

						await Promise.all(
							Object.entries(cookies).map(async ([key, value]) => {
								if (isMultiSessionCookie(key)) {
									ctx.setCookie(key, "", { maxAge: 0 });
									await ctx.context.internalAdapter.deleteSession(
										key.split("_multi-")[1],
									);
								}
							}),
						);

						const response = ctx.context.returned;
						response?.headers.append(
							"Set-Cookie",
							ctx.responseHeader.get("set-cookie")!,
						);

						return { response };
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
