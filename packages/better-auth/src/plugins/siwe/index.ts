import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { APIError } from "../../api";
import { setSessionCookie } from "../../cookies";
import { mergeSchema } from "../../db/schema";
import type { InferOptionSchema, User } from "../../types";
import { toChecksumAddress } from "../../utils/hashing";
import { getOrigin } from "../../utils/url";
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

const getSiweNonceBodySchema = z.object({
	walletAddress: z
		.string()
		.regex(/^0[xX][a-fA-F0-9]{40}$/i)
		.length(42),
	chainId: z.number().int().positive().max(2147483647).optional().default(1),
});

export const siwe = (options: SIWEPluginOptions) =>
	({
		id: "siwe",
		schema: mergeSchema(schema, options?.schema),
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

					// Store nonce with wallet address and chain ID context
					await ctx.context.internalAdapter.createVerificationValue({
						identifier: `siwe:${walletAddress}:${chainId}`,
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
							walletAddress: z
								.string()
								.regex(/^0[xX][a-fA-F0-9]{40}$/i)
								.length(42),
							chainId: z
								.number()
								.int()
								.positive()
								.max(2147483647)
								.optional()
								.default(1),
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
					const isAnon = options.anonymous ?? true;

					if (!isAnon && !email) {
						throw new APIError("BAD_REQUEST", {
							message: "Email is required when anonymous is disabled.",
							status: 400,
						});
					}

					try {
						// Find stored nonce with wallet address and chain ID context
						const verification =
							await ctx.context.internalAdapter.findVerificationValue(
								`siwe:${walletAddress}:${chainId}`,
							);

						// Ensure nonce is valid and not expired
						if (!verification || new Date() > verification.expiresAt) {
							throw new APIError("UNAUTHORIZED", {
								message: "Unauthorized: Invalid or expired nonce",
								status: 401,
								code: "UNAUTHORIZED_INVALID_OR_EXPIRED_NONCE",
							});
						}

						// Verify SIWE message with enhanced parameters
						const { value: nonce } = verification;
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
									nonce,
									iss: options.domain,
									version: "1",
								},
								s: { t: "eip191", s: signature },
							},
						});

						if (!verified) {
							throw new APIError("UNAUTHORIZED", {
								message: "Unauthorized: Invalid SIWE signature",
								status: 401,
							});
						}

						// Clean up used nonce
						await ctx.context.internalAdapter.deleteVerificationValue(
							verification.id,
						);

						// Look for existing user by their wallet addresses
						let user: User | null = null;

						// Check if there's a wallet address record for this exact address+chainId combination
						const existingWalletAddress: WalletAddress | null =
							await ctx.context.adapter.findOne({
								model: "walletAddress",
								where: [
									{ field: "address", operator: "eq", value: walletAddress },
									{ field: "chainId", operator: "eq", value: chainId },
								],
							});

						if (existingWalletAddress) {
							// Get the user associated with this wallet address
							user = await ctx.context.adapter.findOne({
								model: "user",
								where: [
									{
										field: "id",
										operator: "eq",
										value: existingWalletAddress.userId,
									},
								],
							});
						} else {
							// No exact match found, check if this address exists on any other chain
							const anyWalletAddress: WalletAddress | null =
								await ctx.context.adapter.findOne({
									model: "walletAddress",
									where: [
										{ field: "address", operator: "eq", value: walletAddress },
									],
								});

							if (anyWalletAddress) {
								// Same address exists on different chain, get that user
								user = await ctx.context.adapter.findOne({
									model: "user",
									where: [
										{
											field: "id",
											operator: "eq",
											value: anyWalletAddress.userId,
										},
									],
								});
							}
						}

						// Create new user if none exists
						if (!user) {
							const domain =
								options.emailDomainName ?? getOrigin(ctx.context.baseURL);
							// Use checksummed address for email generation
							const userEmail =
								!isAnon && email ? email : `${walletAddress}@${domain}`;
							const { name, avatar } =
								(await options.ensLookup?.({ walletAddress })) ?? {};

							user = await ctx.context.internalAdapter.createUser({
								name: name ?? walletAddress,
								email: userEmail,
								image: avatar ?? "",
							});

							// Create wallet address record
							await ctx.context.adapter.create({
								model: "walletAddress",
								data: {
									userId: user.id,
									address: walletAddress,
									chainId,
									isPrimary: true, // First address is primary
									createdAt: new Date(),
								},
							});

							// Create account record for wallet authentication
							await ctx.context.internalAdapter.createAccount({
								userId: user.id,
								providerId: "siwe",
								accountId: `${walletAddress}:${chainId}`,
								createdAt: new Date(),
								updatedAt: new Date(),
							});
						} else {
							// User exists, but check if this specific address/chain combo exists
							if (!existingWalletAddress) {
								// Add this new chainId to existing user's addresses
								await ctx.context.adapter.create({
									model: "walletAddress",
									data: {
										userId: user.id,
										address: walletAddress,
										chainId,
										isPrimary: false, // Additional addresses are not primary by default
										createdAt: new Date(),
									},
								});

								// Create account record for this new wallet+chain combination
								await ctx.context.internalAdapter.createAccount({
									userId: user.id,
									providerId: "siwe",
									accountId: `${walletAddress}:${chainId}`,
									createdAt: new Date(),
									updatedAt: new Date(),
								});
							}
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
					} catch (error: unknown) {
						if (error instanceof APIError) throw error;
						throw new APIError("UNAUTHORIZED", {
							message: "Something went wrong. Please try again later.",
							error: error instanceof Error ? error.message : "Unknown error",
							status: 401,
						});
					}
				},
			),
		},
	}) satisfies BetterAuthPlugin;
