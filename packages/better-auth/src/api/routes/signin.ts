import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { generateCodeVerifier } from "oslo/oauth2";
import { APIError } from "better-call";
import { providerList } from "../../providers";
import { generateState } from "../../utils/state";

export const signInOAuth = createAuthEndpoint(
	"/signin/oauth",
	{
		method: "POST",
		query: z.object({
			/**
			 * Redirect to the current URL after the user has signed in.
			 */
			currentURL: z.string().optional(),
		}).optional(),
		body: z.object({
			/**
			 * Callback URL to redirect to after the user has signed in.
			 */
			callbackURL: z.string(),
			/**
			 * OAuth2 provider to use`
			 */
			provider: z.enum(providerList),

		}),
	},
	async (c) => {
		const provider = c.options.providers?.find((p) => p.id === c.body.provider);
		if (!provider) {
			throw new APIError("NOT_FOUND");
		}
		if (provider.type === "oauth2") {
			const cookie = c.authCookies;
			const state = generateState(c.body.callbackURL, c.query?.currentURL);
			try {
				await c.setSignedCookie(
					cookie.state.name,
					state.code,
					c.options.secret,
					cookie.state.options,
				);
				const codeVerifier = generateCodeVerifier();
				await c.setSignedCookie(
					cookie.pkCodeVerifier.name,
					codeVerifier,
					c.options.secret,
					cookie.pkCodeVerifier.options,
				);
				const url = await provider.provider.createAuthorizationURL(
					state.state,
					codeVerifier,
				);
				return {
					url: url.toString(),
					state: state.state,
					codeVerifier,
					redirect: true,
				};
			} catch (e) {
				console.log(e);
				throw new APIError("INTERNAL_SERVER_ERROR");
			}
		}
		throw new APIError("NOT_FOUND");
	},
);
