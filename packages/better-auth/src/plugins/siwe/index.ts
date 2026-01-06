import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import type { Account } from "@better-auth/core/db";

import * as z from "zod";
import { APIError, getSessionFromCtx } from "../../api";
import { setSessionCookie } from "../../cookies";
import { mergeSchema } from "../../db/schema";
import type { InferOptionSchema, User } from "../../types";
import { toChecksumAddress } from "../../utils/hashing";
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
									if (account.providerId !== "siwe" || !account.accountId) {
										return;
									}

									const [address, chainIdStr] = account.accountId.split(":");
									const chainId = parseInt(chainIdStr ?? "", 10);

									if (!address || isNaN(chainId)) {
										return;
									}

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
						throw APIError.from(
							"UNAUTHORIZED",
							SIWE_ERROR_CODES.INVALID_OR_EXPIRED_NONCE,
						);
					}

					// Verify SIWE signature
					let verified: boolean;
					try {
						verified = await options.verifyMessage({
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
					} catch {
						throw APIError.from(
							"UNAUTHORIZED",
							SIWE_ERROR_CODES.INVALID_SIWE_SIGNATURE,
						);
					}

					if (!verified) {
						throw APIError.from(
							"UNAUTHORIZED",
							SIWE_ERROR_CODES.INVALID_SIWE_SIGNATURE,
						);
					}

					// Clean up used nonce
					await ctx.context.internalAdapter.deleteVerificationValue(
						verification.id,
					);

					// Check for existing wallet on this chain
					const existingWallet =
						await ctx.context.adapter.findOne<WalletAddress>({
							model: "walletAddress",
							where: [
								{ field: "address", operator: "eq", value: walletAddress },
								{ field: "chainId", operator: "eq", value: chainId },
							],
						});

					// Check for existing wallet on any chain (cross-chain identity)
					const walletOnAnyChain =
						await ctx.context.adapter.findOne<WalletAddress>({
							model: "walletAddress",
							where: [
								{ field: "address", operator: "eq", value: walletAddress },
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

					// Handle wallet linking for authenticated users
					if (shouldLink) {
						const sessionUser = currentSession.user;

						// Wallet already linked to this user - return success (idempotent)
						if (existingWallet && existingWallet.userId === sessionUser.id) {
							return ctx.json({
								token: currentSession.session.token,
								success: true,
								user: { id: sessionUser.id, walletAddress, chainId },
							});
						}

						// Wallet belongs to another user
						if (existingWallet && existingWallet.userId !== sessionUser.id) {
							throw APIError.from(
								"BAD_REQUEST",
								SIWE_ERROR_CODES.WALLET_ALREADY_LINKED,
							);
						}

						// Cross-chain: same address linked to different user
						if (walletOnAnyChain && walletOnAnyChain.userId !== sessionUser.id) {
							throw APIError.from(
								"BAD_REQUEST",
								SIWE_ERROR_CODES.WALLET_ALREADY_LINKED,
							);
						}

						// Link wallet to current user
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
							user: { id: sessionUser.id, walletAddress, chainId },
						});
					}

					// Sign-in/sign-up flow for unauthenticated users
					let user: User | null = null;

					if (existingWallet) {
						user = await ctx.context.adapter.findOne<User>({
							model: "user",
							where: [
								{ field: "id", operator: "eq", value: existingWallet.userId },
							],
						});
					} else if (walletOnAnyChain) {
						user = await ctx.context.adapter.findOne<User>({
							model: "user",
							where: [
								{ field: "id", operator: "eq", value: walletOnAnyChain.userId },
							],
						});
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

						await ctx.context.internalAdapter.createAccount({
							userId: user.id,
							providerId: "siwe",
							accountId: createWalletAccountId(walletAddress, chainId),
						});
					} else if (!existingWallet) {
						// User exists but this specific address/chain combo doesn't
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
						throw APIError.from(
							"INTERNAL_SERVER_ERROR",
							SIWE_ERROR_CODES.SESSION_CREATION_FAILED,
						);
					}

					await setSessionCookie(ctx, { session, user });

					return ctx.json({
						token: session.token,
						success: true,
						user: { id: user.id, walletAddress, chainId },
					});
				},
			),
		},
		options,
	}) satisfies BetterAuthPlugin;
