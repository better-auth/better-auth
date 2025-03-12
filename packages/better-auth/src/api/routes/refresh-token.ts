// import { createAuthEndpoint } from "../call";
// import { z } from "zod";
// import { APIError } from "better-call";
// import type { OAuth2Tokens } from "../../oauth2";
// import { getSessionFromCtx } from "./session";
// export const refreshToken = createAuthEndpoint(
//   "/refresh-token",
//   {
//     method: "POST",
//     body: z.object({
//       accountId: z.string({
//         description: "The refresh token used to obtain a new access token",
//       }),
//       providerId: z
//         .string({
//           description: "The provider ID for the OAuth provider",
//         })
//         .optional(),
//       userId: z
//         .string({
//           description: "The provider ID for the OAuth provider",
//         })
//         .optional(),
//     }),
//     metadata: {
//       openapi: {
//         description: "Refresh the access token using a refresh token",
//         responses: {
//           200: {
//             description: "Access token refreshed successfully",
//             content: {
//               "application/json": {
//                 schema: {
//                   type: "object",
//                   properties: {
//                     accessToken: {
//                       type: "string",
//                     },
//                     refreshToken: {
//                       type: "string",
//                     },
//                     accessTokenExpiresAt: {
//                       type: "string",
//                       format: "date-time",
//                     },
//                   },
//                 },
//               },
//             },
//           },
//           400: {
//             description: "Invalid refresh token or provider configuration",
//           },
//         },
//       },
//     },
//   },
//   async (ctx) => {
//     const { providerId, accountId, userId } = ctx.body;
//     const provider = ctx.context.socialProviders.find(
//       (p) => p.id === providerId,
//     );
//     const session = await getSessionFromCtx(ctx);
//     if (!provider || !provider.refreshAccessToken) {
//       throw new APIError("BAD_REQUEST", {
//         message: `Provider ${providerId} does not support token refreshing.`,
//       });
//     }
//     const account = await ctx.context.internalAdapter.findAccount(accountId);
//     try {
//       // this is for the userid fetch if it is coming from server

//       const account =
//         await ctx.context.internalAdapter.findAccountByUserId(accountId);
//       // const accountById = await ctx.context.internalAdapter.
//       const userAccount = account[0];
//       const tokens: OAuth2Tokens = await provider.refreshAccessToken(
//         userAccount.refreshToken ?? "",
//       );

//       return ctx.json({
//         ...tokens,
//       });
//     } catch (error) {
//       throw new APIError("BAD_REQUEST", {
//         message: "Failed to refresh access token",
//         cause: error,
//       });
//     }
//   },
// );

import { createAuthEndpoint } from "../call";
import { z } from "zod";
import { APIError } from "better-call";
import type { OAuth2Tokens } from "../../oauth2";
import { getSessionFromCtx } from "./session";
import type { Account } from "../../types";

export const refreshToken = createAuthEndpoint(
	"/refresh-token",
	{
		method: "POST",
		body: z.object({
			accountId: z
				.string({
					description: "The account ID associated with the refresh token",
				})
				.optional(),
			providerId: z
				.string({
					description: "The provider ID for the OAuth provider",
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

		let resolvedUserId = session?.user?.id;
		if (req) {
			resolvedUserId = userId;
		}

		const provider = providerId
			? ctx.context.socialProviders.find((p) => p.id === providerId)
			: undefined;
		if (providerId && (!provider || !provider.refreshAccessToken)) {
			throw new APIError("BAD_REQUEST", {
				message: `Provider ${providerId} does not support token refreshing.`,
			});
		}

		let account: Account | null;
		try {
			if (accountId && !providerId) {
				account = await ctx.context.internalAdapter.findAccount(accountId);
			} else if (providerId && resolvedUserId) {
				const accounts =
					await ctx.context.internalAdapter.findAccounts(resolvedUserId);
				account = accounts.find((acc) => acc.providerId === providerId)!;
			}
			if (!account) {
				throw new APIError("BAD_REQUEST", {
					message: "Account not found",
				});
			}
			const resolvedProvider =
				provider ||
				ctx.context.socialProviders.find((p) => p.id === account?.providerId);

			if (!resolvedProvider || !resolvedProvider.refreshAccessToken) {
				throw new APIError("BAD_REQUEST", {
					message: `Provider ${account.providerId} does not support token refreshing.`,
				});
			}
			const tokens: OAuth2Tokens = await resolvedProvider.refreshAccessToken(
				account.refreshToken ?? "",
			);
			return ctx.json({
				...tokens,
			});
		} catch (error) {
			throw new APIError("BAD_REQUEST", {
				message: "Failed to refresh access token",
				cause: error,
			});
		}
	},
);
