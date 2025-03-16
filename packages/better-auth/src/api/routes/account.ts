import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { socialProviderList } from "../../social-providers";
import { APIError } from "better-call";
import { generateState } from "../../oauth2";
import { freshSessionMiddleware, sessionMiddleware } from "./session";
import { BASE_ERROR_CODES } from "../../error/codes";

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
											},
											updatedAt: {
												type: "string",
											},
											accountId: {
												type: "string",
											},
											scopes: {
												type: "array",
												items: { type: "string" },
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
										},
										redirect: {
											type: "boolean",
										},
									},
									required: ["url", "redirect"],
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

		const state = await generateState(c, {
			userId: session.user.id,
			email: session.user.email,
		});

		const url = await provider.createAuthorizationURL({
			state: state.state,
			codeVerifier: state.codeVerifier,
			redirectURI: `${c.context.baseURL}/callback/${provider.id}`,
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
			accountId: z.string(), // Add account ID to identify which account to unlink
		}),
		use: [freshSessionMiddleware],
	},
	async (ctx) => {
		const { providerId, accountId } = ctx.body;
		const accounts = await ctx.context.internalAdapter.findAccounts(
			ctx.context.session.user.id,
		);
		const accountExist = accounts.find(
			(account) =>
				account.providerId === providerId && account.accountId === accountId,
		);
		if (!accountExist) {
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.ACCOUNT_NOT_FOUND,
			});
		}
		if (
			accounts.length === 1 &&
			!ctx.context.options.account?.accountLinking?.allowUnlinkingAll
		) {
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.FAILED_TO_UNLINK_LAST_ACCOUNT,
			});
		}
		await ctx.context.internalAdapter.deleteAccount(accountExist.id);
		return ctx.json({
			status: true,
		});
	},
);
