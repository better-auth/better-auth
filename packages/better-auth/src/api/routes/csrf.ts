import { alphabet, generateRandomString } from "../../crypto/random";
import { hs256 } from "../../crypto";
import { createAuthEndpoint } from "../call";
import { HIDE_METADATA } from "../../utils/hide-metadata";

export const getCSRFToken = createAuthEndpoint(
	"/csrf",
	{
		method: "GET",
		metadata: HIDE_METADATA,
	},
	async (ctx) => {
		const csrfCookie = await ctx.getSignedCookie(
			ctx.context.authCookies.csrfToken.name,
			ctx.context.secret,
		);

		if (csrfCookie) {
			const [token, _] = csrfCookie.split("!") || [null, null];
			return ctx.json({
				csrfToken: token,
			});
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
		return ctx.json({
			csrfToken: token,
		});
	},
);
