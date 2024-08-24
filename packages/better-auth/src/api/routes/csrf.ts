import { alphabet, generateRandomString } from "oslo/crypto";
import { createAuthEndpoint } from "../call";
import { hs256 } from "../../crypto";
import { HIDE_ON_CLIENT_METADATA } from "../../client/client-utils";

export const getCSRFToken = createAuthEndpoint(
	"/csrf",
	{
		method: "GET",
		metadata: HIDE_ON_CLIENT_METADATA,
	},
	async (ctx) => {
		const csrfToken = await ctx.getSignedCookie(
			ctx.context.authCookies.csrfToken.name,
			ctx.context.secret,
		);
		if (csrfToken) {
			return {
				csrfToken,
			};
		}
		const token = generateRandomString(32, alphabet("a-z", "0-9", "A-Z"));
		const hash = await hs256(ctx.context.secret, token);
		const cookie = `${token}!${hash}`;
		await ctx.setSignedCookie(
			ctx.context.authCookies.csrfToken.name,
			cookie,
			ctx.context.secret,
			ctx.context.authCookies.csrfToken.options,
		);
		return {
			csrfToken: token,
		};
	},
);
