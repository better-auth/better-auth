import { implEndpoint } from "../../better-call/server";
import { signOutDef } from "./shared";
import { deleteSessionCookie } from "../../cookies";
import { APIError } from "better-call";
import { BASE_ERROR_CODES } from "../../error/codes";

export const signOut = () =>
	implEndpoint(signOutDef, async (ctx) => {
		const sessionCookieToken = await ctx.getSignedCookie(
			ctx.context.authCookies.sessionToken.name,
			ctx.context.secret,
		);
		if (!sessionCookieToken) {
			deleteSessionCookie(ctx);
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.FAILED_TO_GET_SESSION,
			});
		}
		await ctx.context.internalAdapter.deleteSession(sessionCookieToken);
		deleteSessionCookie(ctx);
		return ctx.json({
			success: true,
		});
	});
