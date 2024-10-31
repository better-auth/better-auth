import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { socialProviderList } from "../../social-providers";
import { APIError } from "better-call";
import { generateState } from "../../oauth2";
import { generateCodeVerifier } from "oslo/oauth2";
import { sessionMiddleware } from "./session";

export const listUserAccounts = createAuthEndpoint(
	"/list-accounts",
	{
		method: "GET",
		use: [sessionMiddleware],
	},
	async (c) => {
		const session = c.context.session;
		const accounts = await c.context.internalAdapter.findAccounts(
			session.user.id,
		);
		return c.json(accounts);
	},
);

export const linkSocialAccount = createAuthEndpoint(
	"/link-social",
	{
		method: "POST",
		requireHeaders: true,
		query: z
			.object({
				/**
				 * Redirect to the current URL after the
				 * user has signed in.
				 */
				currentURL: z.string().optional(),
			})
			.optional(),
		body: z.object({
			/**
			 * Callback URL to redirect to after the user has signed in.
			 */
			callbackURL: z.string().optional(),
			/**
			 * OAuth2 provider to use`
			 */
			provider: z.enum(socialProviderList),
		}),
		use: [sessionMiddleware],
	},
	async (c) => {
		const session = c.context.session;
		const account = await c.context.internalAdapter.findAccounts(
			session.user.id,
		);
		const existingAccount = account.find(
			(a) => a.providerId === c.body.provider,
		);
		if (existingAccount) {
			throw new APIError("BAD_REQUEST", {
				message: "Social Account is already linked.",
			});
		}
		const provider = c.context.socialProviders.find(
			(p) => p.id === c.body.provider,
		);
		if (!provider) {
			c.context.logger.error(
				"Provider not found. Make sure to add the provider in your auth config",
				{
					provider: c.body.provider,
				},
			);
			throw new APIError("NOT_FOUND", {
				message: "Provider not found",
			});
		}
		const cookie = c.context.authCookies;
		const currentURL = c.query?.currentURL
			? new URL(c.query?.currentURL)
			: null;

		const callbackURL = c.body.callbackURL?.startsWith("http")
			? c.body.callbackURL
			: `${currentURL?.origin}${c.body.callbackURL || ""}`;

		const state = await generateState(
			callbackURL || currentURL?.origin || c.context.options.baseURL,
			{
				email: session.user.email,
				userId: session.user.id,
			},
		);
		await c.setSignedCookie(
			cookie.state.name,
			state.hash,
			c.context.secret,
			cookie.state.options,
		);
		const codeVerifier = generateCodeVerifier();
		await c.setSignedCookie(
			cookie.pkCodeVerifier.name,
			codeVerifier,
			c.context.secret,
			cookie.pkCodeVerifier.options,
		);
		const url = await provider.createAuthorizationURL({
			state: state.raw,
			codeVerifier,
			redirectURI: `${c.context.baseURL}/callback/${provider.id}`,
		});
		return c.json({
			url: url.toString(),
			state: state,
			codeVerifier,
			redirect: true,
		});
	},
);
