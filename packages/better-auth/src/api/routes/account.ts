import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { APIError } from "better-call";
import { generateState, type OAuth2Tokens } from "../../oauth2";
import {
	freshSessionMiddleware,
	getSessionFromCtx,
	sessionMiddleware,
} from "./session";
import { BASE_ERROR_CODES } from "../../error/codes";
import { SocialProviderListEnum } from "../../social-providers";

export const listUserAccounts = createAuthEndpoint(
	"/list-accounts",
	{
		method: "GET",
		use: [sessionMiddleware],
		metadata: {
			openapi: {
				description: "List all accounts linked to the user",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "array",
									items: {
										type: "object",
										properties: {
											id: {
												type: "string",
											},
											provider: {
												type: "string",
											},
											createdAt: {
												type: "string",
												format: "date-time",
											},
											updatedAt: {
												type: "string",
												format: "date-time",
											},
										},
										accountId: {
											type: "string",
										},
										scopes: {
											type: "array",
											items: {
												type: "string",
											},
										},
									},
									required: [
										"id",
										"provider",
										"createdAt",
										"updatedAt",
										"accountId",
										"scopes",
									],
								},
							},
						},
					},
				},
			},
		},
	},
	async (c) => {
		const session = c.context.session;
		const accounts = await c.context.internalAdapter.findAccounts(
			session.user.id,
		);
		return c.json(
			accounts.map((a) => ({
				id: a.id,
				provider: a.providerId,
				createdAt: a.createdAt,
				updatedAt: a.updatedAt,
				accountId: a.accountId,
				scopes: a.scope?.split(",") || [],
			})),
		);
	},
);
export const linkSocialAccount = createAuthEndpoint(
	"/link-social",
	{
		method: "POST",
		requireHeaders: true,
		body: z.object({
			/**
			 * Callback URL to redirect to after the user has signed in.
			 */
			callbackURL: z
				.string({
					description: "The URL to redirect to after the user has signed in",
				})
				.optional(),
			/**
			 * OAuth2 provider to use
			 */
			provider: SocialProviderListEnum,
			/**
			 * ID Token for direct authentication without redirect
			 */
			idToken: z
				.object({
					token: z.string(),
					nonce: z.string().optional(),
					accessToken: z.string().optional(),
					refreshToken: z.string().optional(),
					scopes: z.array(z.string()).optional(),
				})
				.optional(),
			/**
			 * Whether to allow sign up for new users
			 */
			requestSignUp: z.boolean().optional(),
			/**
			 * Additional scopes to request when linking the account.
			 * This is useful for requesting additional permissions when
			 * linking a social account compared to the initial authentication.
			 */
			scopes: z
				.array(z.string(), {
					description: "Additional scopes to request from the provider",
				})
				.optional(),
			/**
			 * The URL to redirect to if there is an error during the link process.
			 */
			errorCallbackURL: z
				.string({
					description:
						"The URL to redirect to if there is an error during the link process",
				})
				.optional(),
		}),
		use: [sessionMiddleware],
		metadata: {
			openapi: {
				description: "Link a social account to the user",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										url: {
											type: "string",
											description:
												"The authorization URL to redirect the user to",
										},
										redirect: {
											type: "boolean",
											description:
												"Indicates if the user should be redirected to the authorization URL",
										},
										status: {
											type: "boolean",
										},
									},
									required: ["redirect"],
								},
							},
						},
					},
				},
			},
		},
	},
	async (c) => {
		const session = c.context.session;

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

		// Handle ID Token flow if provided
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

			const linkingUserInfo = await provider.getUserInfo({
				idToken: token,
				accessToken: c.body.idToken.accessToken,
				refreshToken: c.body.idToken.refreshToken,
			});

			if (!linkingUserInfo || !linkingUserInfo?.user) {
				c.context.logger.error("Failed to get user info", {
					provider: c.body.provider,
				});
				throw new APIError("UNAUTHORIZED", {
					message: BASE_ERROR_CODES.FAILED_TO_GET_USER_INFO,
				});
			}

			if (!linkingUserInfo.user.email) {
				c.context.logger.error("User email not found", {
					provider: c.body.provider,
				});
				throw new APIError("UNAUTHORIZED", {
					message: BASE_ERROR_CODES.USER_EMAIL_NOT_FOUND,
				});
			}

			const existingAccounts = await c.context.internalAdapter.findAccounts(
				session.user.id,
			);

			const hasBeenLinked = existingAccounts.find(
				(a) =>
					a.providerId === provider.id &&
					a.accountId === linkingUserInfo.user.id,
			);

			if (hasBeenLinked) {
				return c.json({
					redirect: false,
					url: "", // this is for type inference
					status: true,
				});
			}

			const trustedProviders =
				c.context.options.account?.accountLinking?.trustedProviders;

			const isTrustedProvider = trustedProviders?.includes(provider.id);
			if (
				(!isTrustedProvider && !linkingUserInfo.user.emailVerified) ||
				c.context.options.account?.accountLinking?.enabled === false
			) {
				throw new APIError("UNAUTHORIZED", {
					message: "Account not linked - linking not allowed",
				});
			}

			if (
				linkingUserInfo.user.email !== session.user.email &&
				c.context.options.account?.accountLinking?.allowDifferentEmails !== true
			) {
				throw new APIError("UNAUTHORIZED", {
					message: "Account not linked - different emails not allowed",
				});
			}

			try {
				await c.context.internalAdapter.createAccount(
					{
						userId: session.user.id,
						providerId: provider.id,
						accountId: linkingUserInfo.user.id.toString(),
						accessToken: c.body.idToken.accessToken,
						idToken: token,
						refreshToken: c.body.idToken.refreshToken,
						scope: c.body.idToken.scopes?.join(","),
					},
					c,
				);
			} catch (e: any) {
				throw new APIError("EXPECTATION_FAILED", {
					message: "Account not linked - unable to create account",
				});
			}

			if (
				c.context.options.account?.accountLinking?.updateUserInfoOnLink === true
			) {
				try {
					await c.context.internalAdapter.updateUser(session.user.id, {
						name: linkingUserInfo.user?.name,
						image: linkingUserInfo.user?.image,
					});
				} catch (e: any) {
					console.warn("Could not update user - " + e.toString());
				}
			}

			return c.json({
				redirect: false,
				url: "", // this is for type inference
				status: true,
			});
		}

		// Handle OAuth flow
		const state = await generateState(c, {
			userId: session.user.id,
			email: session.user.email,
		});

		const url = await provider.createAuthorizationURL({
			state: state.state,
			codeVerifier: state.codeVerifier,
			redirectURI: `${c.context.baseURL}/callback/${provider.id}`,
			scopes: c.body.scopes,
		});

		return c.json({
			url: url.toString(),
			redirect: true,
		});
	},
);
export const unlinkAccount = createAuthEndpoint(
	"/unlink-account",
	{
		method: "POST",
		body: z.object({
			providerId: z.string(),
			accountId: z.string().optional(),
		}),
		use: [freshSessionMiddleware],
		metadata: {
			openapi: {
				description: "Unlink an account",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										status: {
											type: "boolean",
										},
									},
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		const { providerId, accountId } = ctx.body;
		const accounts = await ctx.context.internalAdapter.findAccounts(
			ctx.context.session.user.id,
		);
		if (
			accounts.length === 1 &&
			!ctx.context.options.account?.accountLinking?.allowUnlinkingAll
		) {
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.FAILED_TO_UNLINK_LAST_ACCOUNT,
			});
		}
		const accountExist = accounts.find((account) =>
			accountId
				? account.accountId === accountId && account.providerId === providerId
				: account.providerId === providerId,
		);
		if (!accountExist) {
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.ACCOUNT_NOT_FOUND,
			});
		}
		await ctx.context.internalAdapter.deleteAccount(accountExist.id);
		return ctx.json({
			status: true,
		});
	},
);

export const getAccessToken = createAuthEndpoint(
	"/get-access-token",
	{
		method: "POST",
		body: z.object({
			providerId: z.string({
				description: "The provider ID for the OAuth provider",
			}),
			accountId: z
				.string({
					description: "The account ID associated with the refresh token",
				})
				.optional(),
			userId: z
				.string({
					description: "The user ID associated with the account",
				})
				.optional(),
		}),
		metadata: {
			openapi: {
				description: "Get a valid access token, doing a refresh if needed",
				responses: {
					200: {
						description: "A Valid access token",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										tokenType: {
											type: "string",
										},
										idToken: {
											type: "string",
										},
										accessToken: {
											type: "string",
										},
										refreshToken: {
											type: "string",
										},
										accessTokenExpiresAt: {
											type: "string",
											format: "date-time",
										},
										refreshTokenExpiresAt: {
											type: "string",
											format: "date-time",
										},
									},
								},
							},
						},
					},
					400: {
						description: "Invalid refresh token or provider configuration",
					},
				},
			},
		},
	},
	async (ctx) => {
		const { providerId, accountId, userId } = ctx.body;
		const req = ctx.request;
		const session = await getSessionFromCtx(ctx);
		if (req && !session) {
			throw ctx.error("UNAUTHORIZED");
		}
		let resolvedUserId = session?.user?.id || userId;
		if (!resolvedUserId) {
			throw new APIError("BAD_REQUEST", {
				message: `Either userId or session is required`,
			});
		}
		if (!ctx.context.socialProviders.find((p) => p.id === providerId)) {
			throw new APIError("BAD_REQUEST", {
				message: `Provider ${providerId} is not supported.`,
			});
		}
		const accounts =
			await ctx.context.internalAdapter.findAccounts(resolvedUserId);
		const account = accounts.find((acc) =>
			accountId
				? acc.id === accountId && acc.providerId === providerId
				: acc.providerId === providerId,
		);
		if (!account) {
			throw new APIError("BAD_REQUEST", {
				message: "Account not found",
			});
		}
		const provider = ctx.context.socialProviders.find(
			(p) => p.id === providerId,
		);
		if (!provider) {
			throw new APIError("BAD_REQUEST", {
				message: `Provider ${providerId} not found.`,
			});
		}

		try {
			let newTokens: OAuth2Tokens | null = null;

			if (
				account.refreshToken &&
				(!account.accessTokenExpiresAt ||
					account.accessTokenExpiresAt.getTime() - Date.now() < 5_000) &&
				provider.refreshAccessToken
			) {
				newTokens = await provider.refreshAccessToken(
					account.refreshToken as string,
				);
				await ctx.context.internalAdapter.updateAccount(account.id, {
					accessToken: newTokens.accessToken,
					accessTokenExpiresAt: newTokens.accessTokenExpiresAt,
					refreshToken: newTokens.refreshToken,
					refreshTokenExpiresAt: newTokens.refreshTokenExpiresAt,
				});
			}

			const tokens = {
				accessToken: newTokens?.accessToken ?? account.accessToken ?? undefined,
				accessTokenExpiresAt:
					newTokens?.accessTokenExpiresAt ??
					account.accessTokenExpiresAt ??
					undefined,
				scopes: account.scope?.split(",") ?? [],
				idToken: newTokens?.idToken ?? account.idToken ?? undefined,
			} satisfies OAuth2Tokens;

			return ctx.json(tokens);
		} catch (error) {
			throw new APIError("BAD_REQUEST", {
				message: "Failed to get a valid access token",
				cause: error,
			});
		}
	},
);

export const refreshToken = createAuthEndpoint(
	"/refresh-token",
	{
		method: "POST",
		body: z.object({
			providerId: z.string({
				description: "The provider ID for the OAuth provider",
			}),
			accountId: z
				.string({
					description: "The account ID associated with the refresh token",
				})
				.optional(),
			userId: z
				.string({
					description: "The user ID associated with the account",
				})
				.optional(),
		}),
		metadata: {
			openapi: {
				description: "Refresh the access token using a refresh token",
				responses: {
					200: {
						description: "Access token refreshed successfully",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										tokenType: {
											type: "string",
										},
										idToken: {
											type: "string",
										},
										accessToken: {
											type: "string",
										},
										refreshToken: {
											type: "string",
										},
										accessTokenExpiresAt: {
											type: "string",
											format: "date-time",
										},
										refreshTokenExpiresAt: {
											type: "string",
											format: "date-time",
										},
									},
								},
							},
						},
					},
					400: {
						description: "Invalid refresh token or provider configuration",
					},
				},
			},
		},
	},
	async (ctx) => {
		const { providerId, accountId, userId } = ctx.body;
		const req = ctx.request;
		const session = await getSessionFromCtx(ctx);
		if (req && !session) {
			throw ctx.error("UNAUTHORIZED");
		}
		let resolvedUserId = session?.user?.id || userId;
		if (!resolvedUserId) {
			throw new APIError("BAD_REQUEST", {
				message: `Either userId or session is required`,
			});
		}
		if (!ctx.context.socialProviders.find((p) => p.id === providerId)) {
			throw new APIError("BAD_REQUEST", {
				message: `Provider ${providerId} is not supported.`,
			});
		}
		const accounts =
			await ctx.context.internalAdapter.findAccounts(resolvedUserId);
		const account = accounts.find((acc) =>
			accountId
				? acc.id === accountId && acc.providerId === providerId
				: acc.providerId === providerId,
		);
		if (!account) {
			throw new APIError("BAD_REQUEST", {
				message: "Account not found",
			});
		}
		const provider = ctx.context.socialProviders.find(
			(p) => p.id === providerId,
		);
		if (!provider) {
			throw new APIError("BAD_REQUEST", {
				message: `Provider ${providerId} not found.`,
			});
		}
		if (!provider.refreshAccessToken) {
			throw new APIError("BAD_REQUEST", {
				message: `Provider ${providerId} does not support token refreshing.`,
			});
		}
		try {
			const tokens: OAuth2Tokens = await provider.refreshAccessToken(
				account.refreshToken as string,
			);
			await ctx.context.internalAdapter.updateAccount(account.id, {
				accessToken: tokens.accessToken,
				accessTokenExpiresAt: tokens.accessTokenExpiresAt,
				refreshToken: tokens.refreshToken,
				refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
			});
			return ctx.json(tokens);
		} catch (error) {
			throw new APIError("BAD_REQUEST", {
				message: "Failed to refresh access token",
				cause: error,
			});
		}
	},
);

export const accountInfo = createAuthEndpoint(
	"/account-info",
	{
		method: "POST",
		use: [sessionMiddleware],
		metadata: {
			openapi: {
				description: "Get the account info provided by the provider",
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
											properties: {
												id: {
													type: "string",
												},
												name: {
													type: "string",
												},
												email: {
													type: "string",
												},
												image: {
													type: "string",
												},
												emailVerified: {
													type: "boolean",
												},
											},
											required: ["id", "emailVerified"],
										},
										data: {
											type: "object",
											properties: {},
											additionalProperties: true,
										},
									},
									required: ["user", "data"],
									additionalProperties: false,
								},
							},
						},
					},
				},
			},
		},
		body: z.object({
			accountId: z.string({
				description:
					"The provider given account id for which to get the account info",
			}),
		}),
	},
	async (ctx) => {
		const account = await ctx.context.internalAdapter.findAccount(
			ctx.body.accountId,
		);

		if (!account || account.userId !== ctx.context.session.user.id) {
			throw new APIError("BAD_REQUEST", {
				message: "Account not found",
			});
		}

		const provider = ctx.context.socialProviders.find(
			(p) => p.id === account.providerId,
		);

		if (!provider) {
			throw new APIError("INTERNAL_SERVER_ERROR", {
				message: `Provider account provider is ${account.providerId} but it is not configured`,
			});
		}

		const tokens = await getAccessToken({
			...ctx,
			body: {
				accountId: account.id,
				providerId: account.providerId,
			},
			returnHeaders: false,
		});

		const info = await provider.getUserInfo(tokens);

		return ctx.json(info);
	},
);
