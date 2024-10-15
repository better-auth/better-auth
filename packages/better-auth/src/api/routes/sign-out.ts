import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { deleteSessionCookie } from "../../cookies";
import { APIError } from "better-call";
import { redirectURLMiddleware } from "../middlewares/redirect";

export const signOut = createAuthEndpoint(
	"/sign-out",
	{
		method: "POST",
	},
	async (ctx) => {
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
		return ctx.json({
			success: true,
		});
	},
);
