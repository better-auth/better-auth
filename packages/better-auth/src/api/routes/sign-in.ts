import { APIError } from "better-call";
import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { setSessionCookie } from "../../cookies";
import { socialProviderList } from "../../social-providers";
import { createEmailVerificationToken } from "./email-verification";
import { generateState, logger } from "../../utils";

export const signInSocial = createAuthEndpoint(
	"/sign-in/social",
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
			callbackURL: z.string().optional(),
			/**
			 * OAuth2 provider to use`
			 */
			provider: z.enum(socialProviderList),
		}),
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
		const { codeVerifier, state } = await generateState(c);
		const url = await provider.createAuthorizationURL({
			state,
			codeVerifier,
			redirectURI: `${c.context.baseURL}/callback/${provider.id}`,
		});

		return c.json({
			url: url.toString(),
			redirect: true,
		});
	},
);

export const signInEmail = createAuthEndpoint(
	"/sign-in/email",
	{
		method: "POST",
		body: z.object({
			email: z.string(),
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
			ctx.context.logger.error(
				"Email and password is not enabled. Make sure to enable it in the options on you `auth.ts` file. Check `https://better-auth.com/docs/authentication/email-password` for more!",
			);
			throw new APIError("BAD_REQUEST", {
				message: "Email and password is not enabled",
			});
		}
		const { email, password } = ctx.body;
		const isValidEmail = z.string().email().safeParse(email);
		if (!isValidEmail.success) {
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

		await setSessionCookie(
			ctx,
			{
				session,
				user: user.user,
			},
			ctx.body.dontRememberMe,
		);
		return ctx.json({
			user: user.user,
			session,
			redirect: !!ctx.body.callbackURL,
			url: ctx.body.callbackURL,
		});
	},
);
