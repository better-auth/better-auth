import { APIError } from "better-call";
import { generateCodeVerifier } from "oslo/oauth2";
import { Argon2id } from "oslo/password";
import { z } from "zod";
import { oAuthProviderList } from "../../social-providers";
import { generateState } from "../../utils/state";
import { createAuthEndpoint } from "../call";
import { getSessionFromCtx } from "./session";

export const signInOAuth = createAuthEndpoint(
	"/sign-in/social",
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
			provider: z.enum(oAuthProviderList),
		}),
	},
	async (c) => {
		const provider = c.context.options.socialProvider?.find(
			(p) => p.id === c.body.provider,
		);
		if (!provider) {
			throw new APIError("NOT_FOUND");
		}
		const cookie = c.context.authCookies;
		const currentURL = c.query?.currentURL
			? new URL(c.query?.currentURL)
			: null;
		const state = generateState(
			c.body.callbackURL || currentURL?.origin || c.context.baseURL,
			c.query?.currentURL,
		);
		try {
			await c.setSignedCookie(
				cookie.state.name,
				state.code,
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
			throw new APIError("INTERNAL_SERVER_ERROR");
		}
	},
);

export const signInEmail = createAuthEndpoint(
	"/sign-in/email",
	{
		method: "POST",
		body: z.object({
			email: z.string().email(),
			password: z.string(),
			callbackURL: z.string().optional(),
			/**
			 * If this is true the session will only be valid for the current browser session
			 * @default false
			 */
			dontRememberMe: z.boolean().default(false).optional(),
		}),
	},
	async (ctx) => {
		if (!ctx.context.options?.emailAndPassword?.enabled) {
			ctx.context.logger.error("Email and password is not enabled");
			throw new APIError("BAD_REQUEST", {
				message: "Email and password is not enabled",
			});
		}
		const currentSession = await getSessionFromCtx(ctx);
		if (currentSession) {
			return ctx.json({
				user: currentSession.user,
				session: currentSession.session,
				redirect: !!ctx.body.callbackURL,
				url: ctx.body.callbackURL,
			});
		}
		const { email, password } = ctx.body;
		const argon2id = new Argon2id();
		const user = await ctx.context.internalAdapter.findUserByEmail(email);
		if (!user) {
			await argon2id.hash(password);
			ctx.context.logger.error("User not found", { email });
			throw new APIError("UNAUTHORIZED", {
				message: "Invalid email or password",
			});
		}
		const credentialAccount = user.accounts.find(
			(a) => a.providerId === "credential",
		);
		if (!credentialAccount) {
			ctx.context.logger.error("Credential account not found", { email });
			throw new APIError("UNAUTHORIZED", {
				message: "Invalid email or password",
			});
		}
		const currentPassword = credentialAccount?.password;
		if (!currentPassword) {
			ctx.context.logger.error("Password not found", { email });
			throw new APIError("UNAUTHORIZED", {
				message: "Unexpected error",
			});
		}
		const validPassword = await argon2id.verify(currentPassword, password);
		if (!validPassword) {
			ctx.context.logger.error("Invalid password");
			throw new APIError("UNAUTHORIZED", {
				message: "Invalid email or password",
			});
		}
		const session = await ctx.context.internalAdapter.createSession(
			user.user.id,
			ctx.request,
		);
		await ctx.setSignedCookie(
			ctx.context.authCookies.sessionToken.name,
			session.id,
			ctx.context.secret,
			ctx.body.dontRememberMe
				? {
						...ctx.context.authCookies.sessionToken.options,
						maxAge: undefined,
					}
				: ctx.context.authCookies.sessionToken.options,
		);
		return ctx.json({
			user: user.user,
			session,
			redirect: !!ctx.body.callbackURL,
			url: ctx.body.callbackURL,
		});
	},
);
