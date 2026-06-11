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
		const { authorizationURL } = ctx.query;

		// This endpoint sets an OAuth state cookie and redirects, so the target
		// must be an external provider authorization endpoint. Reject malformed
		// or non-https targets and any same-origin Better Auth URL: a same-origin
		// target would let an attacker plant a state cookie and bounce a
		// login-CSRF / session-fixation flow through the auth domain.
		// FIXME(next): bind the redirect to a server-generated, signed proxy
		// token (or validate against the configured provider authorization
		// endpoints) to also close redirects to unrelated external https hosts.
		let url: URL;
		try {
			url = new URL(authorizationURL);
		} catch {
			throw new APIError("BAD_REQUEST", {
				message: "Invalid authorizationURL",
			});
		}
		if (
			url.protocol !== "https:" ||
			url.origin === new URL(ctx.context.baseURL).origin
		) {
			throw new APIError("BAD_REQUEST", {
				message: "Invalid authorizationURL",
			});
		}

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
			return ctx.redirect(authorizationURL);
		}

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
