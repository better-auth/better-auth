import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { deleteSessionCookie } from "../../cookies";
import { APIError } from "better-call";
import { redirectURLMiddleware } from "../middlewares/redirect";

export const signOut = createAuthEndpoint(
	"/sign-out",
	{
		method: "POST",
		body: z.optional(
			z.object({
				callbackURL: z.string().optional(),
			}),
		),
		use: [redirectURLMiddleware],
	},
	async (ctx) => {
		const callbackOrigin = ctx.body?.callbackURL
			? new URL(ctx.body.callbackURL).origin
			: null;
		const trustedOrigins = [
			ctx.context.baseURL,
			...(ctx.context.options.trustedOrigins || []),
		];
		if (callbackOrigin && !trustedOrigins.includes(callbackOrigin)) {
			throw new APIError("UNAUTHORIZED", {
				message: "Invalid callback URL",
			});
		}
		const sessionCookieToken = await ctx.getSignedCookie(
			ctx.context.authCookies.sessionToken.name,
			ctx.context.secret,
		);
		if (!sessionCookieToken) {
			throw new APIError("BAD_REQUEST", {
				message: "Session not found",
			});
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
