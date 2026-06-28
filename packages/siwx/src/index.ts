import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { User } from "better-auth/types";
import * as z from "zod";
import type {
	Cacao,
	ChainType,
	NameLookupArgs,
	NameLookupResult,
	SIWXVerifyMessageArgs,
	SignatureType,
} from "./types";
import { getOrigin, toChecksumAddress } from "./utils";

export interface SIWXPluginOptions {
	domain: string;
	emailDomainName?: string | undefined;
	anonymous?: boolean | undefined;
	statement?: string | undefined;
	supportedChains?: ChainType[] | undefined;
	getNonce: () => Promise<string>;
	verifyMessage: (args: SIWXVerifyMessageArgs) => Promise<boolean>;
	nameLookup?:
		| ((args: NameLookupArgs) => Promise<NameLookupResult>)
		| undefined;
}

const DEFAULT_CHAIN_IDS: Record<ChainType, string> = {
	evm: "1",
	solana: "mainnet-beta",
};

const DEFAULT_SIGNATURE_TYPES: Record<ChainType, SignatureType> = {
	evm: "evm:eip191",
	solana: "solana:ed25519",
};

function normalizeAddress(chainType: ChainType, address: string): string {
	if (chainType === "evm") {
		return toChecksumAddress(address);
	}
	return address;
}

function formatAccountId(
	chainType: ChainType,
	chainId: string,
	address: string,
): string {
	return `${chainType}:${chainId}:${normalizeAddress(chainType, address)}`;
}

function buildCAIP10(
	chainType: ChainType,
	chainId: string,
	address: string,
): string {
	const namespace = chainType === "evm" ? "eip155" : chainType;
	return `${namespace}:${chainId}:${address}`;
}

const chainTypeSchema = z.enum(["evm", "solana"]);

const getSiwxNonceBodySchema = z.object({
	address: z.string().min(1),
	chainType: chainTypeSchema,
	chainId: z.string().optional(),
});

export const siwx = (options: SIWXPluginOptions) => {
	const supportedChains = options.supportedChains ?? ["evm", "solana"];
	const statement = options.statement ?? "Sign in with your wallet";

	const verifySiwxBodySchema = z
		.object({
			message: z.string().min(1),
			signature: z.string().min(1),
			address: z.string().min(1),
			chainType: chainTypeSchema,
			chainId: z.string().optional(),
			signatureType: z.string().optional(),
			email: z.email().optional(),
		})
		.refine((data) => options.anonymous !== false || !!data.email, {
			message:
				"Email is required when the anonymous plugin option is disabled.",
			path: ["email"],
		});

	return {
		id: "siwx",
		endpoints: {
			getSiwxNonce: createAuthEndpoint(
				"/siwx/nonce",
				{
					method: "POST",
					body: getSiwxNonceBodySchema,
				},
				async (ctx) => {
					const { address, chainType, chainId: requestedChainId } = ctx.body;

					if (!supportedChains.includes(chainType)) {
						throw new APIError("BAD_REQUEST", {
							message: `Unsupported chain type: ${chainType}. Supported chains: ${supportedChains.join(", ")}`,
							status: 400,
							code: "UNSUPPORTED_CHAIN_TYPE",
						});
					}

					const chainId = requestedChainId ?? DEFAULT_CHAIN_IDS[chainType];
					const normalizedAddress = normalizeAddress(chainType, address);
					const nonce = await options.getNonce();
					const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

					// Store nonce with chain type, chain ID, and address context
					await ctx.context.internalAdapter.createVerificationValue({
						identifier: `siwx:${chainType}:${chainId}:${normalizedAddress}`,
						value: nonce,
						expiresAt,
					});

					return ctx.json({
						nonce,
						expiresAt: expiresAt.toISOString(),
						statement,
						chainId,
					});
				},
			),
			verifySiwxMessage: createAuthEndpoint(
				"/siwx/verify",
				{
					method: "POST",
					body: verifySiwxBodySchema,
					requireRequest: true,
				},
				async (ctx) => {
					const {
						message,
						signature,
						address,
						chainType,
						chainId: requestedChainId,
						signatureType: requestedSignatureType,
						email,
					} = ctx.body;
					const isAnon = options.anonymous ?? true;

					if (!supportedChains.includes(chainType)) {
						throw new APIError("BAD_REQUEST", {
							message: `Unsupported chain type: ${chainType}. Supported chains: ${supportedChains.join(", ")}`,
							status: 400,
							code: "UNSUPPORTED_CHAIN_TYPE",
						});
					}

					const chainId = requestedChainId ?? DEFAULT_CHAIN_IDS[chainType];
					const signatureType: SignatureType =
						(requestedSignatureType as SignatureType) ??
						DEFAULT_SIGNATURE_TYPES[chainType];
					const normalizedAddress = normalizeAddress(chainType, address);

					try {
						// Find stored nonce with chain type, chain ID, and address context
						const identifier = `siwx:${chainType}:${chainId}:${normalizedAddress}`;
						const verification =
							await ctx.context.internalAdapter.findVerificationValue(
								identifier,
							);

						// Ensure nonce is valid and not expired
						if (!verification || new Date() > verification.expiresAt) {
							throw new APIError("UNAUTHORIZED", {
								message: "Unauthorized: Invalid or expired nonce",
								status: 401,
								code: "INVALID_OR_EXPIRED_NONCE",
							});
						}

						const { value: nonce } = verification;

						// Bind the signed message to the issued nonce. Without this the
						// server only relies on `verifyMessage` to enforce the nonce, so a
						// naive implementation that checks signature validity alone would
						// accept a replayed signature over any previously signed message.
						if (!message.includes(nonce)) {
							throw new APIError("UNAUTHORIZED", {
								message: "Unauthorized: Message does not contain the nonce",
								status: 401,
								code: "INVALID_NONCE_BINDING",
							});
						}

						// Build CAIP-122 compliant CACAO object for verification
						const cacao: Cacao = {
							h: { t: "caip122" },
							p: {
								domain: options.domain,
								iss: buildCAIP10(chainType, chainId, normalizedAddress),
								aud: options.domain,
								version: "1",
								nonce,
								iat: new Date().toISOString(),
								statement,
							},
							s: {
								t: signatureType,
								s: signature,
							},
						};

						// Verify message signature using user-provided verification function
						const verified = await options.verifyMessage({
							message,
							signature,
							address: normalizedAddress,
							chainType,
							chainId,
							signatureType,
							cacao,
						});

						if (!verified) {
							throw new APIError("UNAUTHORIZED", {
								message: "Unauthorized: Invalid signature",
								status: 401,
								code: "UNAUTHORIZED_INVALID_SIGNATURE",
							});
						}

						// Clean up used nonce to prevent replay attacks
						await ctx.context.internalAdapter.deleteVerificationByIdentifier(
							identifier,
						);

						const accountId = formatAccountId(
							chainType,
							chainId,
							normalizedAddress,
						);

						// Look for existing user by their wallet account
						let user: User | null = null;

						// Check if there's an account record for this exact chainType:chainId:address combination
						const existingAccount =
							await ctx.context.internalAdapter.findAccountByProviderId(
								accountId,
								"siwx",
							);

						if (existingAccount) {
							// Get the user associated with this account
							user = await ctx.context.internalAdapter.findUserById(
								existingAccount.userId,
							);
						} else {
							// No exact match found, check if this address exists on any other
							// chain. accountId is `${chainType}:${chainId}:${address}`, so an
							// address suffix match links the same wallet across chains without
							// scanning every siwx account.
							const [matchingAccount] = await ctx.context.adapter.findMany<{
								userId: string;
								accountId: string;
							}>({
								model: "account",
								where: [
									{ field: "providerId", operator: "eq", value: "siwx" },
									{
										field: "accountId",
										operator: "ends_with",
										value: `:${normalizedAddress}`,
									},
								],
								limit: 1,
							});

							if (matchingAccount) {
								// Same address exists on different chain, get that user
								user = await ctx.context.internalAdapter.findUserById(
									matchingAccount.userId,
								);
							}

							// Create new user if none exists
							if (!user) {
								const domain =
									options.emailDomainName ??
									getOrigin(ctx.context.baseURL) ??
									options.domain;
								const userEmail =
									!isAnon && email ? email : `${normalizedAddress}@${domain}`;
								const { name, avatar } =
									(await options.nameLookup?.({
										address: normalizedAddress,
										chainType,
										chainId,
									})) ?? {};

								user = await ctx.context.internalAdapter.createUser({
									name: name ?? normalizedAddress,
									email: userEmail,
									image: avatar ?? "",
								});
							}

							// Create account record for this chainType:chainId:address combination
							await ctx.context.internalAdapter.createAccount({
								userId: user.id,
								providerId: "siwx",
								accountId,
								createdAt: new Date(),
								updatedAt: new Date(),
							});
						}

						if (!user) {
							throw new APIError("INTERNAL_SERVER_ERROR", {
								message: "Internal Server Error",
								status: 500,
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
								address: normalizedAddress,
								chainType,
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
		options,
	} satisfies BetterAuthPlugin;
};

export type {
	Cacao,
	CacaoHeader,
	CacaoPayload,
	CacaoSignature,
	ChainType,
	NameLookupArgs,
	NameLookupResult,
	SIWXVerifyMessageArgs,
	SignatureType,
} from "./types";
