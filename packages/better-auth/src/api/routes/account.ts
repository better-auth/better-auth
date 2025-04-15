import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { socialProviderList } from "../../social-providers";
import { APIError } from "better-call";
import { generateState } from "../../oauth2";
import { freshSessionMiddleware, sessionMiddleware } from "./session";
import { BASE_ERROR_CODES } from "../../error/codes";
import { handleOAuthUserInfo } from "../../oauth2/link-account";

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
			provider: z.enum(socialProviderList, {
				description: "The OAuth2 provider to use",
			}),
			/**
			 * ID Token for direct authentication without redirect
			 */
			idToken: z
				.object({
					token: z.string(),
					nonce: z.string().optional(),
					accessToken: z.string().optional(),
					refreshToken: z.string().optional(),
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
					refreshToken: c.body.idToken.refreshToken,
					idToken: token,
				},
				disableSignUp: true, // Always disable signup for linking
			});

			if (data.error) {
				throw new APIError("BAD_REQUEST", {
					message: data.error,
				});
			}

			return c.json({
				redirect: false,
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
