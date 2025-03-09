import { createAuthEndpoint } from "../call";
import { z } from "zod";
import { APIError } from "better-call";
import type { OAuth2Tokens } from "../../oauth2";
export const refreshToken = createAuthEndpoint(
	"/refresh-token",
	{
		method: "POST",
		body: z.object({
			accountId: z.string({
				description: "The refresh token used to obtain a new access token",
			}),
			providerId: z.string({
				description: "The provider ID for the OAuth provider",
			}),
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
		const { providerId, accountId } = ctx.body;

		const provider = ctx.context.socialProviders.find(
			(p) => p.id === providerId,
		);

		if (!provider || !provider.refreshAccessToken) {
			throw new APIError("BAD_REQUEST", {
				message: `Provider ${providerId} does not support token refreshing.`,
			});
		}

		try {
			const account =
				await ctx.context.internalAdapter.findAccountByUserId(accountId);
			const userAccount = account[0];
			const tokens: OAuth2Tokens = await provider.refreshAccessToken(
				userAccount.refreshToken ?? "",
			);
			console.log({ tokens });

			return ctx.json({
				accessToken: tokens.accessToken,
				refreshToken: tokens.refreshToken,
				accessTokenExpiresAt: tokens.accessTokenExpiresAt,
			});
		} catch (error) {
			throw new APIError("BAD_REQUEST", {
				message: "Failed to refresh access token",
				cause: error,
			});
		}
	},
);
