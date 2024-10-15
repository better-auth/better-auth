import { APIError } from "better-call";
import { z } from "zod";
import { hs256 } from "../../crypto";
import { createAuthMiddleware } from "../call";

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
			ctx.context.options.advanced?.disableCSRFCheck
		) {
			return;
		}
		const url = new URL(ctx.request.url);
		/**
		 * If origin is the same as baseURL or if the
		 * origin is in the trustedOrigins then we
		 * don't need to check the CSRF token.
		 */
		if (ctx.context.trustedOrigins.includes(url.origin)) {
			return;
		}

		const csrfToken = ctx.body?.csrfToken;
		if (!csrfToken) {
			throw new APIError("UNAUTHORIZED", {
				message: "CSRF Token is required",
			});
		}
		const csrfCookie = await ctx.getSignedCookie(
			ctx.context.authCookies.csrfToken.name,
			ctx.context.secret,
		);
		const [token, hash] = csrfCookie?.split("!") || [null, null];
		if (
			!csrfToken ||
			!csrfCookie ||
			!token ||
			!hash ||
			csrfCookie !== csrfToken
		) {
			ctx.setCookie(ctx.context.authCookies.csrfToken.name, "", {
				maxAge: 0,
			});
			throw new APIError("UNAUTHORIZED", {
				message: "Invalid CSRF Token",
			});
		}
		const expectedHash = await hs256(ctx.context.secret, token);
		if (hash !== expectedHash) {
			ctx.setCookie(ctx.context.authCookies.csrfToken.name, "", {
				maxAge: 0,
			});
			throw new APIError("UNAUTHORIZED", {
				message: "Invalid CSRF Token",
			});
		}
	},
);
