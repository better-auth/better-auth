//@ts-nocheck
import { createAuthEndpoint, sessionMiddleware } from "./index";
import { z } from "zod";

export const revokeDeviceSession = createAuthEndpoint(
	"/multi-session/revoke",
	{
		method: "POST",
		body: z.object({
			sessionToken: z.string({
				description: 'The session token to revoke. Eg: "some-session-token"',
			}),
		}),
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
			).filter((v): v is string => v !== undefined);
			const internalAdapter = ctx.context.internalAdapter;

			if (sessionTokens.length > 0) {
				const sessions = await internalAdapter.findSessions(sessionTokens);
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
			status: true,
		});
	},
);
