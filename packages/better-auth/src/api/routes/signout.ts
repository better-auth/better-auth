import { createAuthEndpoint } from "../call";

export const signOut = createAuthEndpoint(
	"/signout",
	{
		method: "POST",
	},
	async (ctx) => {
		const sessionCookieToken = await ctx.getSignedCookie(
			ctx.authCookies.sessionToken.name,
			ctx.options.secret,
		);
		if (!sessionCookieToken) {
			return ctx.json(null);
		}
		await ctx.internalAdapter.deleteSession(sessionCookieToken);
		ctx.setCookie(ctx.authCookies.sessionToken.name, "", {
			maxAge: 0,
		});
		return ctx.json(null);
	},
);
