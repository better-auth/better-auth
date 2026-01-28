import { HIDE_METADATA } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import * as z from "zod";

export const expoAuthorizationProxy = createAuthEndpoint(
	"/expo-authorization-proxy",
	{
		method: "GET",
		query: z.object({
			authorizationURL: z.string(),
			oauthState: z.string().optional(),
		}),
		metadata: HIDE_METADATA,
	},
	async (ctx) => {
		const { oauthState } = ctx.query;
		if (oauthState) {
			const oauthStateCookie = ctx.context.createAuthCookie("oauth_state", {
				maxAge: 10 * 60, // 10 minutes
			});
			ctx.setCookie(
				oauthStateCookie.name,
				oauthState,
				oauthStateCookie.attributes,
			);
			return ctx.redirect(ctx.query.authorizationURL);
		}

		const { authorizationURL } = ctx.query;
		const url = new URL(authorizationURL);
		const state = url.searchParams.get("state");
		if (!state) {
			throw new APIError("BAD_REQUEST", {
				message: "Unexpected error",
			});
		}
		const stateCookie = ctx.context.createAuthCookie("state", {
			maxAge: 5 * 60, // 5 minutes
		});
		await ctx.setSignedCookie(
			stateCookie.name,
			state,
			ctx.context.secret,
			stateCookie.attributes,
		);
		return ctx.redirect(ctx.query.authorizationURL);
	},
);
