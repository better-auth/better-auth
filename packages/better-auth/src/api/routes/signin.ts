import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { generateCodeVerifier } from "oslo/oauth2";
import { APIError } from "better-call";
import { generateState } from "../../utils/state";
import { oAuthProviderList } from "../../providers";
import { Argon2id } from "oslo/password";

export const signInOAuth = createAuthEndpoint(
	"/signin/oauth",
	{
		method: "POST",
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
			callbackURL: z.string(),
			/**
			 * OAuth2 provider to use`
			 */
			provider: z.enum(oAuthProviderList),
		}),
	},
	async (c) => {
		const provider = c.context.options.providers?.find(
			(p) => p.id === c.body.provider,
		);
		if (!provider) {
			throw new APIError("NOT_FOUND");
		}
		if (provider.type === "oauth2") {
			const cookie = c.context.authCookies;
			const state = generateState(c.body.callbackURL, c.query?.currentURL);
			try {
				await c.setSignedCookie(
					cookie.state.name,
					state.code,
					c.context.options.secret,
					cookie.state.options,
				);
				const codeVerifier = generateCodeVerifier();
				await c.setSignedCookie(
					cookie.pkCodeVerifier.name,
					codeVerifier,
					c.context.options.secret,
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

export const signInCredential = createAuthEndpoint(
	"/sign-in/credential",
	{
		method: "POST",
		body: z.object({
			email: z.string().email(),
			password: z.string(),
		}),
	},
	async (ctx) => {
		if (!ctx.context.options?.emailAndPassword?.enabled) {
			ctx.context.logger.error("Email and password is not enabled");
			return ctx.json({
				message: "Email and password is not enabled",
				status: 400,
			});
		}
		const { email, password } = ctx.body;
		const user = await ctx.context.internalAdapter.findUserByEmail(email);
		if (!user) {
			ctx.context.logger.error("User not found");
			return ctx.json(null, {
				status: 400,
			});
		}
		const credentialAccount = user.accounts.find(
			(a) => a.providerId === "credential",
		);
		const currentPassword = credentialAccount?.password;
		if (!currentPassword) {
			ctx.context.logger.error("Password not found");
			return ctx.json(
				{ message: "unexpected error" },
				{
					status: 400,
				},
			);
		}
		const argon2id = new Argon2id();
		const hash = await argon2id.hash(password);
		const validPassword = await argon2id.verify(hash, password);
		if (!validPassword) {
			ctx.context.logger.error("Invalid password");
			return ctx.json(
				{ message: "Invalid email or password" },
				{
					status: 400,
				},
			);
		}
		const session = await ctx.context.internalAdapter.createSession(
			user.user.id,
		);
		await ctx.setSignedCookie(
			ctx.context.authCookies.sessionToken.name,
			session.id,
			ctx.context.options.secret,
			ctx.context.authCookies.sessionToken.options,
		);
		return ctx.json({
			user: user.user,
			session,
		});
	},
);
