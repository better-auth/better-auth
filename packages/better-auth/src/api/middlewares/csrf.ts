import { z } from "zod";
import { createAuthMiddleware } from "../call";
import { APIError } from "better-call";
import { hs256 } from "../../crypto";

export const csrfMiddleware = createAuthMiddleware(
	{
		body: z
			.object({
				csrfToken: z.string().optional(),
			})
			.optional(),
	},
	async (ctx) => {
		if (
			ctx.request?.method !== "POST" ||
			ctx.options.advanced?.disableCSRFCheck
		)
			return;
		const csrfToken = ctx.body?.csrfToken;
		const csrfCookie = await ctx.getSignedCookie(
			ctx.authCookies.csrfToken.name,
			ctx.options.secret,
		);
		const [token, hash] = csrfCookie?.split("!") || [null, null];
		if (
			!csrfToken ||
			!csrfCookie ||
			!token ||
			!hash ||
			csrfCookie !== csrfToken
		) {
			ctx.setCookie(ctx.authCookies.csrfToken.name, "", {
				maxAge: 0,
			});
			throw new APIError("UNAUTHORIZED", {
				message: "Invalid CSRF Token",
			});
		}
		const expectedHash = await hs256(ctx.options.secret, token);
		if (hash !== expectedHash) {
			ctx.setCookie(ctx.authCookies.csrfToken.name, "", {
				maxAge: 0,
			});
			throw new APIError("UNAUTHORIZED", {
				message: "Invalid CSRF Token",
			});
		}
	},
);
