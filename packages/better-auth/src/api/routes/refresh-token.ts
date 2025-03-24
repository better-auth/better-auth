import { createAuthEndpoint } from "../call";
import { z } from "zod";
import { APIError } from "better-call";
import type { OAuth2Tokens } from "../../oauth2";
import { getSessionFromCtx } from "./session";

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
