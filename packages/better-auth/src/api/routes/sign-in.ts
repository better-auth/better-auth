import { APIError } from "better-call";
import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { setSessionCookie } from "../../cookies";
import { SocialProviderListEnum } from "../../social-providers";
import { createEmailVerificationToken } from "./email-verification";
import { generateState } from "../../utils";
import { handleOAuthUserInfo } from "../../oauth2/link-account";
import { BASE_ERROR_CODES } from "../../error/codes";

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
			 * Callback URL to redirect to after the user
			 * has signed in.
			 */
			callbackURL: z
				.string({
					description:
						"Callback URL to redirect to after the user has signed in",
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
				.string({
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
				.boolean({
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
					token: z.string({
						description: "ID token from the provider",
					}),
					/**
					 * The nonce used to generate the token
					 */
					nonce: z
						.string({
							description: "Nonce used to generate the token",
						})
						.optional(),
					/**
					 * Access token from the provider
					 */
					accessToken: z
						.string({
							description: "Access token from the provider",
						})
						.optional(),
					/**
					 * Refresh token from the provider
					 */
					refreshToken: z
						.string({
							description: "Refresh token from the provider",
						})
						.optional(),
					/**
					 * Expiry date of the token
					 */
					expiresAt: z
						.number({
							description: "Expiry date of the token",
						})
						.optional(),
				}),
				{
					description:
						"ID token from the provider to sign in the user with id token",
				},
			),
		}),
		metadata: {
			openapi: {
				description: "Sign in with a social provider",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										session: {
											type: "string",
										},
										user: {
											type: "object",
										},
										url: {
											type: "string",
										},
										redirect: {
											type: "boolean",
										},
									},
									required: ["session", "user", "url", "redirect"],
								},
							},
						},
					},
				},
			},
		},
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
					email: userInfo.user.email,
					id: userInfo.user.id,
					name: userInfo.user.name || "",
					image: userInfo.user.image,
					emailVerified: userInfo.user.emailVerified || false,
				},
				account: {
					providerId: provider.id,
					accountId: userInfo.user.id,
					accessToken: c.body.idToken.accessToken,
				},
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
				user: {
					id: data.data!.user.id,
					email: data.data!.user.email,
					name: data.data!.user.name,
					image: data.data!.user.image,
					emailVerified: data.data!.user.emailVerified,
					createdAt: data.data!.user.createdAt,
					updatedAt: data.data!.user.updatedAt,
				},
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
			redirect: !c.body.disableRedirect,
		});
	},
);

export const signInEmail = createAuthEndpoint(
	"/sign-in/email",
	{
		method: "POST",
		body: z.object({
			/**
			 * Email of the user
			 */
			email: z.string({
				description: "Email of the user",
			}),
			/**
			 * Password of the user
			 */
			password: z.string({
				description: "Password of the user",
			}),
			/**
			 * Callback URL to use as a redirect for email
			 * verification and for possible redirects
			 */
			callbackURL: z
				.string({
					description:
						"Callback URL to use as a redirect for email verification",
				})
				.optional(),
			/**
			 * If this is false, the session will not be remembered
			 * @default true
			 */
			rememberMe: z
				.boolean({
					description:
						"If this is false, the session will not be remembered. Default is `true`.",
				})
				.default(true)
				.optional(),
		}),
		metadata: {
			openapi: {
				description: "Sign in with email and password",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										user: {
											type: "object",
										},
										url: {
											type: "string",
										},
										redirect: {
											type: "boolean",
										},
									},
									required: ["session", "user", "url", "redirect"],
								},
							},
						},
					},
				},
			},
		},
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
				message: BASE_ERROR_CODES.INVALID_EMAIL,
			});
		}
		const user = await ctx.context.internalAdapter.findUserByEmail(email, {
			includeAccounts: true,
		});

		if (!user) {
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
			ctx.context.logger.error("Credential account not found", { email });
			throw new APIError("UNAUTHORIZED", {
				message: BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD,
			});
		}
		const currentPassword = credentialAccount?.password;
		if (!currentPassword) {
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
				throw new APIError("UNAUTHORIZED", {
					message: BASE_ERROR_CODES.EMAIL_NOT_VERIFIED,
				});
			}
			const token = await createEmailVerificationToken(
				ctx.context.secret,
				user.user.email,
			);
			const url = `${
				ctx.context.baseURL
			}/verify-email?token=${token}&callbackURL=${ctx.body.callbackURL || "/"}`;
			await ctx.context.options.emailVerification.sendVerificationEmail(
				{
					user: user.user,
					url,
					token,
				},
				ctx.request,
			);
			throw new APIError("FORBIDDEN", {
				message: BASE_ERROR_CODES.EMAIL_NOT_VERIFIED,
			});
		}

		const session = await ctx.context.internalAdapter.createSession(
			user.user.id,
			ctx.headers,
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
			user: {
				id: user.user.id,
				email: user.user.email,
				name: user.user.name,
				image: user.user.image,
				emailVerified: user.user.emailVerified,
				createdAt: user.user.createdAt,
				updatedAt: user.user.updatedAt,
			},
		});
	},
);
