import { alphabet, generateRandomString, HMAC } from "oslo/crypto";
import { createAuthEndpoint } from "../call";
import { hs256 } from "../../crypto";
import { base64 } from "oslo/encoding";

export const getCSRFToken = createAuthEndpoint(
	"/csrf",
	{
		method: "GET",
	},
	async (ctx) => {
		const csrfToken = await ctx.getSignedCookie(
			ctx.authCookies.csrfToken.name,
			ctx.options.secret,
		);
		if (csrfToken) {
			return {
				csrfToken,
			};
		}
		const token = generateRandomString(32, alphabet("a-z", "0-9", "A-Z"));
		const hash = await hs256(ctx.options.secret, token);
		const cookie = `${token}!${hash}`;
		await ctx.setSignedCookie(
			ctx.authCookies.csrfToken.name,
			cookie,
			ctx.options.secret,
			ctx.authCookies.csrfToken.options,
		);
		return {
			csrfToken: token,
		};
	},
);
