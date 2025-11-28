import { APIError, createAuthEndpoint } from "better-auth/api";
import * as z from "zod";

export const expoAuthorizationProxy = createAuthEndpoint(
	"/expo-authorization-proxy",
	{
		method: "GET",
		query: z.object({
			authorizationURL: z.string(),
		}),
		metadata: {
			isAction: false,
		},
	},
	async (ctx) => {
		const { authorizationURL } = ctx.query;
		const url = new URL(authorizationURL);
		const state = url.searchParams.get("state");
		if (!state) {
			throw new APIError("BAD_REQUEST", {
				message: "Unexpected error",
			});
		}
		const stateCookie = ctx.context.createAuthCookie("state", {
			maxAge: 5 * 60 * 1000, // 5 minutes
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
