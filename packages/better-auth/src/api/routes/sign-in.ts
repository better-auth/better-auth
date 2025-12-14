import type { BetterAuthOptions } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { SocialProviderListEnum } from "@better-auth/core/social-providers";
import { APIError } from "better-call";
import * as z from "zod";
import { setSessionCookie } from "../../cookies";
import { parseUserOutput } from "../../db/schema";
import { handleOAuthUserInfo } from "../../oauth2/link-account";
import type { InferUser } from "../../types";
import { generateState } from "../../utils";
import { createEmailVerificationToken } from "./email-verification";

const socialSignInBodySchema = z.object({
	/**
	 * Callback URL to redirect to after the user
	 * has signed in.
	 */
	callbackURL: z
		.string()
		.meta({
			description: "Callback URL to redirect to after the user has signed in",
		})
		.optional(),
	/**
	 * callback url to redirect if the user is newly registered.
	 *
	 * useful if you have different routes for existing users and new users
	 */
	newUserCallbackURL: z.string().optional(),
	/**
	 * Callback url to redirect to if an error happens
	 *
	 * If it's initiated from the client sdk this defaults to
	 * the current url.
	 */
	errorCallbackURL: z
		.string()
		.meta({
			description: "Callback URL to redirect to if an error happens",
		})
		.optional(),
	/**
	 * OAuth2 provider to use`
	 */
	provider: SocialProviderListEnum,
	/**
	 * Disable automatic redirection to the provider
	 *
	 * This is useful if you want to handle the redirection
	 * yourself like in a popup or a different tab.
	 */
	disableRedirect: z
		.boolean()
		.meta({
			description:
				"Disable automatic redirection to the provider. Useful for handling the redirection yourself",
		})
		.optional(),
	/**
	 * ID token from the provider
	 *
	 * This is used to sign in the user
	 * if the user is already signed in with the
	 * provider in the frontend.
	 *
	 * Only applicable if the provider supports
	 * it. Currently only `apple` and `google` is
	 * supported out of the box.
	 */
	idToken: z.optional(
		z.object({
			/**
			 * ID token from the provider
			 */
			token: z.string().meta({
				description: "ID token from the provider",
			}),
			/**
			 * The nonce used to generate the token
			 */
			nonce: z
				.string()
				.meta({
					description: "Nonce used to generate the token",
				})
				.optional(),
			/**
			 * Access token from the provider
			 */
			accessToken: z
				.string()
				.meta({
					description: "Access token from the provider",
				})
				.optional(),
			/**
			 * Refresh token from the provider
			 */
			refreshToken: z
				.string()
				.meta({
					description: "Refresh token from the provider",
				})
				.optional(),
			/**
			 * Expiry date of the token
			 */
			expiresAt: z
				.number()
				.meta({
					description: "Expiry date of the token",
				})
				.optional(),
		}),
	),
	scopes: z
		.array(z.string())
		.meta({
			description:
				"Array of scopes to request from the provider. This will override the default scopes passed.",
		})
		.optional(),
	/**
	 * Explicitly request sign-up
	 *
	 * Should be used to allow sign up when
	 * disableImplicitSignUp for this provider is
	 * true
	 */
	requestSignUp: z
		.boolean()
		.meta({
			description:
				"Explicitly request sign-up. Useful when disableImplicitSignUp is true for this provider",
		})
		.optional(),
	/**
	 * The login hint to use for the authorization code request
	 */
	loginHint: z
		.string()
		.meta({
			description: "The login hint to use for the authorization code request",
		})
		.optional(),
	/**
	 * Additional data to be passed through the OAuth flow
	 */
	additionalData: z.record(z.string(), z.any()).optional().meta({
		description: "Additional data to be passed through the OAuth flow",
	}),
});

export const signInSocial = <O extends BetterAuthOptions>() =>
	createAuthEndpoint(
		"/sign-in/social",
		{
			method: "POST",
			operationId: "socialSignIn",
			body: socialSignInBodySchema,
			metadata: {
				$Infer: {
					body: {} as z.infer<typeof socialSignInBodySchema>,
					returned: {} as {
						redirect: boolean;
						token?: string | undefined;
						url?: string | undefined;
						user?: InferUser<O> | undefined;
					},
				},
				openapi: {
					description: "Sign in with a social provider",
					operationId: "socialSignIn",
					responses: {
						"200": {
							description:
								"Success - Returns either session details or redirect URL",
							content: {
								"application/json": {
									schema: {
										// todo: we need support for multiple schema
										type: "object",
										description: "Session response when idToken is provided",
										properties: {
											token: {
												type: "string",
											},
											user: {
												type: "object",
												$ref: "#/components/schemas/User",
											},
											url: {
												type: "string",
											},
											redirect: {
												type: "boolean",
												enum: [false],
											},
										},
										required: ["redirect", "token", "user"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (
			c,
		): Promise<
			| { redirect: boolean; url: string }
			| { redirect: boolean; token: string; url: undefined; user: InferUser<O> }
		> => {
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
					message: BASE_ERROR_CODES.PROVIDER_NOT_FOUND,
				});
			}

			if (c.body.idToken) {
				if (!provider.verifyIdToken) {
					c.context.logger.error(
						"Provider does not support id token verification",
						{
							provider: c.body.provider,
						},
					);
					throw new APIError("NOT_FOUND", {
						message: BASE_ERROR_CODES.ID_TOKEN_NOT_SUPPORTED,
					});
				}
				const { token, nonce } = c.body.idToken;
				const valid = await provider.verifyIdToken(token, nonce);
				if (!valid) {
					c.context.logger.error("Invalid id token", {
						provider: c.body.provider,
					});
					throw new APIError("UNAUTHORIZED", {
						message: BASE_ERROR_CODES.INVALID_TOKEN,
					});
				}
				const userInfo = await provider.getUserInfo({
					idToken: token,
					accessToken: c.body.idToken.accessToken,
					refreshToken: c.body.idToken.refreshToken,
				});
				if (!userInfo || !userInfo?.user) {
					c.context.logger.error("Failed to get user info", {
						provider: c.body.provider,
					});
					throw new APIError("UNAUTHORIZED", {
						message: BASE_ERROR_CODES.FAILED_TO_GET_USER_INFO,
					});
				}
				if (!userInfo.user.email) {
					c.context.logger.error("User email not found", {
						provider: c.body.provider,
					});
					throw new APIError("UNAUTHORIZED", {
						message: BASE_ERROR_CODES.USER_EMAIL_NOT_FOUND,
					});
				}
				const data = await handleOAuthUserInfo(c, {
					userInfo: {
						...userInfo.user,
						email: userInfo.user.email,
						id: String(userInfo.user.id),
						name: userInfo.user.name || "",
						image: userInfo.user.image,
						emailVerified: userInfo.user.emailVerified || false,
					},
					account: {
						providerId: provider.id,
						accountId: String(userInfo.user.id),
						accessToken: c.body.idToken.accessToken,
					},
					callbackURL: c.body.callbackURL,
					disableSignUp:
						(provider.disableImplicitSignUp && !c.body.requestSignUp) ||
						provider.disableSignUp,
				});
				if (data.error) {
					throw new APIError("UNAUTHORIZED", {
						message: data.error,
					});
				}
				await setSessionCookie(c, data.data!);
				return c.json({
					redirect: false,
					token: data.data!.session.token,
					url: undefined,
					user: parseUserOutput(
						c.context.options,
						data.data!.user,
					) as InferUser<O>,
				});
			}

			const { codeVerifier, state } = await generateState(
				c,
				undefined,
				c.body.additionalData,
			);
			const url = await provider.createAuthorizationURL({
				state,
				codeVerifier,
				redirectURI: `${c.context.baseURL}/callback/${provider.id}`,
				scopes: c.body.scopes,
				loginHint: c.body.loginHint,
			});

			return c.json({
				url: url.toString(),
				redirect: !c.body.disableRedirect,
			});
		},
	);

export const signInEmail = <O extends BetterAuthOptions>() =>
	createAuthEndpoint(
		"/sign-in/email",
		{
			method: "POST",
			operationId: "signInEmail",
			body: z.object({
				/**
				 * Email of the user
				 */
				email: z.string().meta({
					description: "Email of the user",
				}),
				/**
				 * Password of the user
				 */
				password: z.string().meta({
					description: "Password of the user",
				}),
				/**
				 * Callback URL to use as a redirect for email
				 * verification and for possible redirects
				 */
				callbackURL: z
					.string()
					.meta({
						description:
							"Callback URL to use as a redirect for email verification",
					})
					.optional(),
				/**
				 * If this is false, the session will not be remembered
				 * @default true
				 */
				rememberMe: z
					.boolean()
					.meta({
						description:
							"If this is false, the session will not be remembered. Default is `true`.",
					})
					.default(true)
					.optional(),
			}),
			metadata: {
				$Infer: {
					body: {} as {
						email: string;
						password: string;
						callbackURL?: string | undefined;
						rememberMe?: boolean | undefined;
					},
					returned: {} as {
						redirect: boolean;
						token: string;
						url?: string | undefined;
						user: InferUser<O>;
					},
				},
				openapi: {
					operationId: "signInEmail",
					description: "Sign in with email and password",
					responses: {
						"200": {
							description:
								"Success - Returns either session details or redirect URL",
							content: {
								"application/json": {
									schema: {
										// todo: we need support for multiple schema
										type: "object",
										description: "Session response when idToken is provided",
										properties: {
											redirect: {
												type: "boolean",
												enum: [false],
											},
											token: {
												type: "string",
												description: "Session token",
											},
											url: {
												type: "string",
												nullable: true,
											},
											user: {
												type: "object",
												$ref: "#/components/schemas/User",
											},
										},
										required: ["redirect", "token", "user"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (
			ctx,
		): Promise<{
			redirect: boolean;
			token: string;
			url?: string | undefined;
			user: InferUser<O>;
		}> => {
			if (!ctx.context.options?.emailAndPassword?.enabled) {
				ctx.context.logger.error(
					"Email and password is not enabled. Make sure to enable it in the options on you `auth.ts` file. Check `https://better-auth.com/docs/authentication/email-password` for more!",
				);
				throw new APIError("BAD_REQUEST", {
					message: "Email and password is not enabled",
				});
			}
			const { email, password } = ctx.body;
			const isValidEmail = z.email().safeParse(email);
			if (!isValidEmail.success) {
				throw new APIError("BAD_REQUEST", {
					message: BASE_ERROR_CODES.INVALID_EMAIL,
				});
			}
			const user = await ctx.context.internalAdapter.findUserByEmail(email, {
				includeAccounts: true,
			});

			if (!user) {
				// Hash password to prevent timing attacks from revealing valid email addresses
				// By hashing passwords for invalid emails, we ensure consistent response times
				await ctx.context.password.hash(password);
				ctx.context.logger.error("User not found", { email });
				throw new APIError("UNAUTHORIZED", {
					message: BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD,
				});
			}

			const credentialAccount = user.accounts.find(
				(a) => a.providerId === "credential",
			);
			if (!credentialAccount) {
				await ctx.context.password.hash(password);
				ctx.context.logger.error("Credential account not found", { email });
				throw new APIError("UNAUTHORIZED", {
					message: BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD,
				});
			}
			const currentPassword = credentialAccount?.password;
			if (!currentPassword) {
				await ctx.context.password.hash(password);
				ctx.context.logger.error("Password not found", { email });
				throw new APIError("UNAUTHORIZED", {
					message: BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD,
				});
			}
			const validPassword = await ctx.context.password.verify({
				hash: currentPassword,
				password,
			});
			if (!validPassword) {
				ctx.context.logger.error("Invalid password");
				throw new APIError("UNAUTHORIZED", {
					message: BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD,
				});
			}

			if (
				ctx.context.options?.emailAndPassword?.requireEmailVerification &&
				!user.user.emailVerified
			) {
				if (!ctx.context.options?.emailVerification?.sendVerificationEmail) {
					throw new APIError("FORBIDDEN", {
						message: BASE_ERROR_CODES.EMAIL_NOT_VERIFIED,
					});
				}

				if (ctx.context.options?.emailVerification?.sendOnSignIn) {
					const token = await createEmailVerificationToken(
						ctx.context.secret,
						user.user.email,
						undefined,
						ctx.context.options.emailVerification?.expiresIn,
					);
					const callbackURL = ctx.body.callbackURL
						? encodeURIComponent(ctx.body.callbackURL)
						: encodeURIComponent("/");
					const url = `${ctx.context.baseURL}/verify-email?token=${token}&callbackURL=${callbackURL}`;
					await ctx.context.options.emailVerification.sendVerificationEmail(
						{
							user: user.user,
							url,
							token,
						},
						ctx.request,
					);
				}

				throw new APIError("FORBIDDEN", {
					message: BASE_ERROR_CODES.EMAIL_NOT_VERIFIED,
				});
			}

			const session = await ctx.context.internalAdapter.createSession(
				user.user.id,
				ctx.body.rememberMe === false,
			);

			if (!session) {
				ctx.context.logger.error("Failed to create session");
				throw new APIError("UNAUTHORIZED", {
					message: BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
				});
			}

			await setSessionCookie(
				ctx,
				{
					session,
					user: user.user,
				},
				ctx.body.rememberMe === false,
			);
			return ctx.json({
				redirect: !!ctx.body.callbackURL,
				token: session.token,
				url: ctx.body.callbackURL,
				user: parseUserOutput(ctx.context.options, user.user) as InferUser<O>,
			});
		},
	);
