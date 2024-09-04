import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { deleteSessionCookie } from "../../utils/cookies";

export const signOut = createAuthEndpoint(
	"/sign-out",
	{
		method: "POST",
		body: z
			.object({
				callbackURL: z.string().optional(),
			})
			.optional(),
	},
	async (ctx) => {
		const sessionCookieToken = await ctx.getSignedCookie(
			ctx.context.authCookies.sessionToken.name,
			ctx.context.secret,
		);
		if (!sessionCookieToken) {
			return ctx.json(null);
		}
		await ctx.context.internalAdapter.deleteSession(sessionCookieToken);
		deleteSessionCookie(ctx);
		return ctx.json(null, {
			body: {
				redirect: !!ctx.body?.callbackURL,
				url: ctx.body?.callbackURL,
			},
		});
	},
);
