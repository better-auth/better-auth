import { z } from "zod";
import {
	APIError,
	createAuthEndpoint,
	createAuthMiddleware,
	sessionMiddleware,
} from "../../api";
import { parseSetCookieHeader } from "../../cookies";
import type { BetterAuthPlugin, Session, User } from "../../types";

export const multiSession = () => {
	return {
		id: "multi-session",
		endpoints: {
			setActiveSession: createAuthEndpoint(
				"/session/set-active",
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
					return ctx.json({
						message: "Session set as active",
					});
				},
			),
			listDeviceSessions: createAuthEndpoint(
				"/session/list-device-sessions",
				{
					method: "GET",
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const cookieHeader = ctx.headers?.get("cookie");
					if (!cookieHeader) {
						return ctx.json([]);
					}
					const cookies = Object.fromEntries(
						parseSetCookieHeader(cookieHeader).entries(),
					);
					const sessions: {
						session: Session;
						user: User;
					}[] = [];
					for (const key of Object.keys(cookies)) {
						if (key.includes("_multi-")) {
							const sessionId = await ctx.getSignedCookie(
								key,
								ctx.context.secret,
							);
							if (sessionId) {
								const session =
									await ctx.context.internalAdapter.findSession(sessionId);
								if (session && session.session.expiresAt > new Date()) {
									sessions.push(session);
								} else {
									ctx.setCookie(key, "", {
										...ctx.context.authCookies.sessionToken.options,
										maxAge: 0,
									});
								}
							}
						}
					}
				},
			),
		},
		hooks: {
			after: [
				{
					matcher() {
						return true;
					},
					handler: createAuthMiddleware(async (ctx) => {
						if (
							!ctx.context.returned ||
							!(ctx.context.returned instanceof Response)
						)
							return;
						const cookieString = ctx.context.returned.headers.get("set-cookie");
						if (!cookieString) return;
						const cookies = parseSetCookieHeader(cookieString || "");
						const sessionCookieConfig = ctx.context.authCookies.sessionToken;
						const hasSessionCookie = cookies.get(sessionCookieConfig.name);
						if (!hasSessionCookie) return;
						const sessionToken = cookies.get(sessionCookieConfig.name)?.value;
						if (!sessionToken) return;
						const rawSession = sessionToken.split(".")[0];
						await ctx.setSignedCookie(
							`${sessionCookieConfig.name}_multi-${rawSession}`,
							rawSession,
							ctx.context.secret,
							sessionCookieConfig.options,
						);
						const toBeAppendedCookie = ctx.responseHeader.get("set-cookie")!;
						const response = ctx.context.returned;
						response.headers.append("Set-Cookie", toBeAppendedCookie);
						return {
							response,
						};
					}),
				},
				{
					matcher(context) {
						return context.path === "/sign-out";
					},
					handler: createAuthMiddleware(async (ctx) => {
						const cookieHeader = ctx.headers?.get("cookie");
						if (!cookieHeader) {
							return;
						}
						const cookies = Object.fromEntries(
							parseSetCookieHeader(cookieHeader).entries(),
						);
						for (const key of Object.keys(cookies)) {
							if (key.includes("_multi-")) {
								ctx.setCookie(key, "", {
									...ctx.context.authCookies.sessionToken.options,
									maxAge: 0,
								});
							}
						}
						const response = ctx.context.returned;
						response?.headers.append(
							"Set-Cookie",
							ctx.responseHeader.get("set-cookie")!,
						);
						return {
							response,
						};
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
