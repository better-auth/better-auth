import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import type { Account } from "@better-auth/core/db";

import * as z from "zod";
import { APIError, getSessionFromCtx } from "../../api";
import { setSessionCookie } from "../../cookies";
import { mergeSchema } from "../../db/schema";
import type { InferOptionSchema, User } from "../../types";
import { toChecksumAddress } from "../../utils/hashing";
import { isAPIError } from "../../utils/is-api-error";
import { getOrigin } from "../../utils/url";
import { SIWE_ERROR_CODES } from "./error-codes";
import { schema } from "./schema";
import type {
	ENSLookupArgs,
	ENSLookupResult,
	SIWEVerifyMessageArgs,
	WalletAddress,
} from "./types";

export interface SIWEPluginOptions {
	domain: string;
	emailDomainName?: string | undefined;
	anonymous?: boolean | undefined;
	getNonce: () => Promise<string>;
	verifyMessage: (args: SIWEVerifyMessageArgs) => Promise<boolean>;
	ensLookup?: ((args: ENSLookupArgs) => Promise<ENSLookupResult>) | undefined;
	schema?: InferOptionSchema<typeof schema> | undefined;
}

const walletAddressSchema = z
	.string()
	.regex(/^0[xX][a-fA-F0-9]{40}$/i)
	.length(42);

const chainIdSchema = z
	.number()
	.int()
	.positive()
	.max(2147483647)
	.optional()
	.default(1);

const getSiweNonceBodySchema = z.object({
	walletAddress: walletAddressSchema,
	chainId: chainIdSchema,
});

const createWalletAccountId = (walletAddress: string, chainId: number) =>
	`${walletAddress}:${chainId}`;


export const siwe = (options: SIWEPluginOptions) =>
	({
		id: "siwe",
		schema: mergeSchema(schema, options?.schema),
		init(ctx) {
			return {
				options: {
					databaseHooks: {
						account: {
							delete: {
								async after(account: Account) {
									// Only handle SIWE account deletions
									if (account.providerId !== "siwe" || !account.accountId) {
										return;
									}

									// Parse the accountId format: "address:chainId"
									const [address, chainIdStr] = account.accountId.split(":");
									const chainId = parseInt(chainIdStr ?? "", 10);

									if (!address || isNaN(chainId)) {
										return;
									}

									// Cascade delete the corresponding walletAddress record
									await ctx.adapter.deleteMany({
										model: "walletAddress",
										where: [
											{ field: "address", value: address },
											{ field: "chainId", value: chainId },
											{ field: "userId", value: account.userId },
										],
									});
								},
							},
						},
					},
				},
			};
		},
		endpoints: {
			getSiweNonce: createAuthEndpoint(
				"/siwe/nonce",
				{
					method: "POST",
					body: getSiweNonceBodySchema,
				},
				async (ctx) => {
					const { walletAddress: rawWalletAddress, chainId } = ctx.body;
					const walletAddress = toChecksumAddress(rawWalletAddress);
					const nonce = await options.getNonce();

					await ctx.context.internalAdapter.createVerificationValue({
						identifier: `siwe:${createWalletAccountId(walletAddress, chainId)}`,
						value: nonce,
						expiresAt: new Date(Date.now() + 15 * 60 * 1000),
					});

					return ctx.json({ nonce });
				},
			),
			verifySiweMessage: createAuthEndpoint(
				"/siwe/verify",
				{
					method: "POST",
					body: z
						.object({
							message: z.string().min(1),
							signature: z.string().min(1),
							walletAddress: walletAddressSchema,
							chainId: chainIdSchema,
							email: z.email().optional(),
						})
						.refine((data) => options.anonymous !== false || !!data.email, {
							message:
								"Email is required when the anonymous plugin option is disabled.",
							path: ["email"],
						}),
					requireRequest: true,
				},
				async (ctx) => {
					const {
						message,
						signature,
						walletAddress: rawWalletAddress,
						chainId,
						email,
					} = ctx.body;

					const walletAddress = toChecksumAddress(rawWalletAddress);
					const isAnonymous = options.anonymous ?? true;

					// Verify nonce exists and is not expired
					const verification =
						await ctx.context.internalAdapter.findVerificationValue(
							`siwe:${createWalletAccountId(walletAddress, chainId)}`,
						);

					if (!verification || new Date() > verification.expiresAt) {
						throw new APIError("UNAUTHORIZED", {
							message: SIWE_ERROR_CODES.INVALID_OR_EXPIRED_NONCE,
							status: 401,
						});
					}

					const verified = await options.verifyMessage({
						message,
						signature,
						address: walletAddress,
						chainId,
						cacao: {
							h: { t: "caip122" },
							p: {
								domain: options.domain,
								aud: options.domain,
								nonce: verification.value,
								iss: options.domain,
								version: "1",
							},
							s: { t: "eip191", s: signature },
						},
					});

					if (!verified) {
						throw new APIError("UNAUTHORIZED", {
							message: SIWE_ERROR_CODES.INVALID_SIWE_SIGNATURE,
							status: 401,
						});
					}

					// Clean up used nonce
					await ctx.context.internalAdapter.deleteVerificationValue(
						verification.id,
					);

					const existingWallet: WalletAddress | null =
						await ctx.context.adapter.findOne<WalletAddress>({
							model: "walletAddress",
							where: [
								{ field: "address", operator: "eq", value: walletAddress },
								{ field: "chainId", operator: "eq", value: chainId },
							],
						});

					const currentSession = await getSessionFromCtx(ctx);
					const accountLinking = ctx.context.options.account?.accountLinking;
					const trustedProviders = accountLinking?.trustedProviders;

					const shouldLink =
						currentSession !== null &&
						accountLinking?.enabled !== false &&
						(trustedProviders === undefined ||
							trustedProviders.length === 0 ||
							trustedProviders.includes("siwe"));

					if (shouldLink) {
						const sessionUser = currentSession.user;

						if (existingWallet) {
							if (existingWallet.userId !== sessionUser.id) {
								throw new APIError("BAD_REQUEST", {
									message: SIWE_ERROR_CODES.WALLET_ALREADY_LINKED,
								});
							}

							return ctx.json({
								token: currentSession.session.token,
								success: true,
								user: {
									id: sessionUser.id,
									walletAddress,
									chainId,
								},
							});
						}

						// Check if this wallet address exists on any other chain (same wallet, different network)
						// This prevents different users from linking the same wallet address on different chains,
						// while still allowing the same user to link their wallet on multiple chains.
						const walletOnOtherChain =
							await ctx.context.adapter.findOne<WalletAddress>({
								model: "walletAddress",
								where: [
									{ field: "address", operator: "eq", value: walletAddress },
								],
							});

						if (walletOnOtherChain && walletOnOtherChain.userId !== sessionUser.id) {
							throw new APIError("BAD_REQUEST", {
								message: SIWE_ERROR_CODES.WALLET_ALREADY_LINKED,
							});
						}

						await ctx.context.adapter.create({
							model: "walletAddress",
							data: {
								userId: sessionUser.id,
								address: walletAddress,
								chainId,
								isPrimary: false,
								createdAt: new Date(),
							},
						});

						await ctx.context.internalAdapter.linkAccount({
							userId: sessionUser.id,
							providerId: "siwe",
							accountId: createWalletAccountId(walletAddress, chainId),
						});

						return ctx.json({
							token: currentSession.session.token,
							success: true,
							user: {
								id: sessionUser.id,
								walletAddress,
								chainId,
							},
						});
					}

					let user: User | null = null;

					if (existingWallet) {
						user = await ctx.context.adapter.findOne<User>({
							model: "user",
							where: [
								{ field: "id", operator: "eq", value: existingWallet.userId },
							],
						});
					} else {
						// Check if this address exists on any other chain (same wallet, different network)
						const walletOnOtherChain: WalletAddress | null =
							await ctx.context.adapter.findOne<WalletAddress>({
								model: "walletAddress",
								where: [
									{ field: "address", operator: "eq", value: walletAddress },
								],
							});

						if (walletOnOtherChain) {
							user = await ctx.context.adapter.findOne<User>({
								model: "user",
								where: [
									{
										field: "id",
										operator: "eq",
										value: walletOnOtherChain.userId,
									},
								],
							});
						}
					}

					// Create new user if none found
					if (!user) {
						const domain =
							options.emailDomainName ?? getOrigin(ctx.context.baseURL);
						const userEmail =
							!isAnonymous && email ? email : `${walletAddress}@${domain}`;
						const { name, avatar } =
							(await options.ensLookup?.({ walletAddress })) ?? {};

						user = await ctx.context.internalAdapter.createUser({
							name: name ?? walletAddress,
							email: userEmail,
							image: avatar ?? "",
						});

						// Create wallet address record (primary for new users)
						await ctx.context.adapter.create({
							model: "walletAddress",
							data: {
								userId: user.id,
								address: walletAddress,
								chainId,
								isPrimary: true,
								createdAt: new Date(),
							},
						});

						// Create account record
						await ctx.context.internalAdapter.createAccount({
							userId: user.id,
							providerId: "siwe",
							accountId: createWalletAccountId(walletAddress, chainId),
						});
					} else if (!existingWallet) {
						// User exists but this specific address/chain combo doesn't - add it
						await ctx.context.adapter.create({
							model: "walletAddress",
							data: {
								userId: user.id,
								address: walletAddress,
								chainId,
								isPrimary: false,
								createdAt: new Date(),
							},
						});

						await ctx.context.internalAdapter.createAccount({
							userId: user.id,
							providerId: "siwe",
							accountId: createWalletAccountId(walletAddress, chainId),
						});
					}

					const session = await ctx.context.internalAdapter.createSession(
						user.id,
					);

					if (!session) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: "Internal Server Error",
							status: 500,
						});
					}

					await setSessionCookie(ctx, { session, user });

					return ctx.json({
						token: session.token,
						success: true,
						user: {
							id: user.id,
							walletAddress,
							chainId,
						},
					});
				},
			),
		},
		options,
	}) satisfies BetterAuthPlugin;
