import { createAuthEndpoint } from "../call";
import { z } from "zod";
import { APIError } from "better-call";
import type { OAuth2Tokens } from "../../oauth2";
import { getSessionFromCtx } from "./session";
import {
	socialProviderList,
	type SocialProvider,
} from "../../social-providers";

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
			SERVER_ONLY: true,
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
		if (!socialProviderList.includes(providerId as SocialProvider)) {
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
			let newTokens: OAuth2Tokens | null = null;

			if (
				!account.accessTokenExpiresAt ||
				account.accessTokenExpiresAt.getTime() - Date.now() < 5_000 // 5 second buffer
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
