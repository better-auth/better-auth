import { createAuthEndpoint } from "../call";

export const getSession = createAuthEndpoint(
	"/session",
	{
		method: "GET",
		requireHeaders: true,
	},
	async (ctx) => {
		const sessionCookieToken = await ctx.getSignedCookie(
			ctx.authCookies.sessionToken.name,
			ctx.options.secret,
		);
		if (!sessionCookieToken) {
			return ctx.json(null, {
				status: 401,
			});
		}
		const session = await ctx.internalAdapter.findSession(sessionCookieToken);
		if (!session || session.session.expiresAt < new Date()) {
			ctx.setCookie(ctx.authCookies.sessionToken.name, "", {
				maxAge: 0,
			});
			return ctx.json(null, {
				status: 401,
			});
		}
		const updatedSession = await ctx.internalAdapter.updateSession(
			session.session,
		);
		return ctx.json({
			session: updatedSession,
			user: session.user,
		});
	},
);
