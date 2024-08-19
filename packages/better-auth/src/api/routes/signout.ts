import { createAuthEndpoint } from "../call";

export const signOut = createAuthEndpoint(
	"/signout",
	{
		method: "POST",
	},
	async (ctx) => {
		const sessionCookieToken = await ctx.getSignedCookie(
			ctx.context.authCookies.sessionToken.name,
			ctx.context.options.secret,
		);
		if (!sessionCookieToken) {
			return ctx.json(null);
		}
		await ctx.context.internalAdapter.deleteSession(sessionCookieToken);
		ctx.setCookie(ctx.context.authCookies.sessionToken.name, "", {
			maxAge: 0,
		});
		return ctx.json(null);
	},
);
