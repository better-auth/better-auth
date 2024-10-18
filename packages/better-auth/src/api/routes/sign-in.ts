import { APIError } from "better-call";
import { generateCodeVerifier } from "oslo/oauth2";
import { z } from "zod";
import { generateState } from "../../oauth2/state";
import { createAuthEndpoint } from "../call";
import { setSessionCookie } from "../../cookies";
import { redirectURLMiddleware } from "../middlewares/redirect";
import { socialProviderList } from "../../social-providers";
import { createEmailVerificationToken } from "./email-verification";
import { logger } from "../../utils";

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
			provider: z.enum(socialProviderList),
		}),
		use: [redirectURLMiddleware],
	},
	async (c) => {
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
		use: [redirectURLMiddleware],
	},
	async (ctx) => {
		if (!ctx.context.options?.emailAndPassword?.enabled) {
			ctx.context.logger.error(
				"Email and password is not enabled. Make sure to enable it in the options on you `auth.ts` file. Check `https://better-auth.com/docs/authentication/email-password` for more!",
			);
			throw new APIError("BAD_REQUEST", {
				message: "Email and password is not enabled",
			});
		}
		const { email, password } = ctx.body;
		const checkEmail = z.string().email().safeParse(email);
		if (!checkEmail.success) {
			throw new APIError("BAD_REQUEST", {
				message: "Invalid email",
			});
		}
		const user = await ctx.context.internalAdapter.findUserByEmail(email, {
			includeAccounts: true,
		});

		if (!user) {
			await ctx.context.password.hash(password);
			ctx.context.logger.error("User not found", { email });
			throw new APIError("UNAUTHORIZED", {
				message: "Invalid email or password",
			});
		}

		if (
			ctx.context.options?.emailAndPassword?.requireEmailVerification &&
			!user.user.emailVerified
		) {
			if (!ctx.context.options?.emailVerification?.sendVerificationEmail) {
				logger.error(
					"Email verification is required but no email verification handler is provided",
				);
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: "Email is not verified.",
				});
			}
			const token = await createEmailVerificationToken(
				ctx.context.secret,
				user.user.email,
			);
			const url = `${ctx.context.options.baseURL}/verify-email?token=${token}`;
			await ctx.context.options.emailVerification.sendVerificationEmail(
				user.user,
				url,
				token,
			);
			ctx.context.logger.error("Email not verified", { email });
			throw new APIError("FORBIDDEN", {
				message:
					"Email is not verified. Check your email for a verification link",
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
		const validPassword = await ctx.context.password.verify(
			currentPassword,
			password,
		);
		if (!validPassword) {
			ctx.context.logger.error("Invalid password");
			throw new APIError("UNAUTHORIZED", {
				message: "Invalid email or password",
			});
		}

		const session = await ctx.context.internalAdapter.createSession(
			user.user.id,
			ctx.headers,
			ctx.body.dontRememberMe,
		);

		if (!session) {
			ctx.context.logger.error("Failed to create session");
			throw new APIError("UNAUTHORIZED", {
				message: "Failed to create session",
			});
		}

		await setSessionCookie(ctx, session.id, ctx.body.dontRememberMe);
		return ctx.json({
			user: user.user,
			session,
			redirect: !!ctx.body.callbackURL,
			url: ctx.body.callbackURL,
		});
	},
);
