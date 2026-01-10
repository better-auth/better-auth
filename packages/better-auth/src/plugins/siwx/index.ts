import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { APIError } from "../../api";
import { setSessionCookie } from "../../cookies";
import type { User } from "../../types";
import { toChecksumAddress } from "../../utils/hashing";
import { getOrigin } from "../../utils/url";
import type {
	Cacao,
	ChainType,
	NameLookupArgs,
	NameLookupResult,
	NativeCallbackOptions,
	NativeWalletProvider,
	SIWXVerifyMessageArgs,
	SignatureType,
} from "./types";

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
	callback?: NativeCallbackOptions | undefined;
}

const DEFAULT_CHAIN_IDS: Record<ChainType, string> = {
	evm: "1",
	solana: "mainnet-beta",
};

const DEFAULT_SIGNATURE_TYPES: Record<ChainType, SignatureType> = {
	evm: "evm:eip191",
	solana: "solana:ed25519",
};

const DEFAULT_CALLBACK_PROVIDERS: NativeWalletProvider[] = [
	"phantom",
	"solflare",
	"backpack",
];

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

const nativeWalletProviderSchema = z.enum(["phantom", "solflare", "backpack"]);

export const siwx = (options: SIWXPluginOptions) => {
	const supportedChains = options.supportedChains ?? ["evm", "solana"];
	const statement = options.statement ?? "Sign in with your wallet";
	const callbackProviders =
		options.callback?.providers ?? DEFAULT_CALLBACK_PROVIDERS;

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

					await ctx.context.internalAdapter.createVerificationValue({
						identifier: `siwx:${chainType}:${chainId}:${normalizedAddress}`,
						value: nonce,
						expiresAt: new Date(Date.now() + 15 * 60 * 1000),
					});

					return ctx.json({
						nonce,
						expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
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
						const identifier = `siwx:${chainType}:${chainId}:${normalizedAddress}`;
						const verification =
							await ctx.context.internalAdapter.findVerificationValue(
								identifier,
							);

						if (!verification || new Date() > verification.expiresAt) {
							throw new APIError("UNAUTHORIZED", {
								message: "Unauthorized: Invalid or expired nonce",
								status: 401,
								code: "INVALID_OR_EXPIRED_NONCE",
							});
						}

						const { value: nonce } = verification;

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
							});
						}

						await ctx.context.internalAdapter.deleteVerificationValue(
							verification.id,
						);

						const accountId = formatAccountId(
							chainType,
							chainId,
							normalizedAddress,
						);

						let user: User | null = null;

						const existingAccount =
							await ctx.context.internalAdapter.findAccountByProviderId(
								accountId,
								"siwx",
							);

						if (existingAccount) {
							user = await ctx.context.internalAdapter.findUserById(
								existingAccount.userId,
							);
						} else {
							const allAccounts = await ctx.context.adapter.findMany<{
								userId: string;
								accountId: string;
							}>({
								model: "account",
								where: [{ field: "providerId", operator: "eq", value: "siwx" }],
							});

							const matchingAccount = allAccounts.find((acc) => {
								const parts = acc.accountId.split(":");
								if (parts.length >= 3) {
									const accAddress = parts.slice(2).join(":");
									return (
										accAddress.toLowerCase() === normalizedAddress.toLowerCase()
									);
								}
								return false;
							});

							if (matchingAccount) {
								user = await ctx.context.internalAdapter.findUserById(
									matchingAccount.userId,
								);
							}

							if (!user) {
								const domain =
									options.emailDomainName ?? getOrigin(ctx.context.baseURL);
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
			siwxCallback: createAuthEndpoint(
				"/siwx/callback/:provider",
				{
					method: "GET",
					query: z.record(z.string(), z.string()),
					requireRequest: true,
				},
				async (ctx) => {
					const provider = ctx.params.provider as string;
					const successRedirect =
						options.callback?.successRedirect ?? "/?success=true";
					const errorRedirect =
						options.callback?.errorRedirect ?? "/login?success=false";

					if (!options.callback?.appPrivateKeyBase58) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: "Callback not configured",
							status: 500,
						});
					}

					const providerResult = nativeWalletProviderSchema.safeParse(provider);
					if (
						!providerResult.success ||
						!callbackProviders.includes(providerResult.data)
					) {
						throw new APIError("BAD_REQUEST", {
							message: `Unsupported provider: ${provider}`,
							status: 400,
							code: "UNSUPPORTED_PROVIDER",
						});
					}

					if ("errorCode" in ctx.query) {
						const errorCode = ctx.query.errorCode;
						const errorMessage = ctx.query.errorMessage ?? "Unknown error";
						throw ctx.redirect(
							`${errorRedirect}&provider=${provider}&errorCode=${encodeURIComponent(errorCode)}&errorMessage=${encodeURIComponent(errorMessage)}`,
						);
					}

					let pubKeyBytes: Uint8Array;
					let nonceBytes: Uint8Array;
					let encryptedDataBytes: Uint8Array;

					try {
						const bs58 = await import("bs58");
						const appPrivateKeyBytes = bs58.default.decode(
							options.callback.appPrivateKeyBase58,
						);

						if (provider === "phantom") {
							const res = z
								.object({
									phantom_encryption_public_key: z.string(),
									nonce: z.string(),
									data: z.string(),
								})
								.parse(ctx.query);
							pubKeyBytes = bs58.default.decode(
								res.phantom_encryption_public_key,
							);
							nonceBytes = bs58.default.decode(res.nonce);
							encryptedDataBytes = bs58.default.decode(res.data);
						} else if (provider === "solflare") {
							const res = z
								.object({
									solflare_encryption_public_key: z.string(),
									nonce: z.string(),
									data: z.string(),
								})
								.parse(ctx.query);
							pubKeyBytes = bs58.default.decode(
								res.solflare_encryption_public_key,
							);
							nonceBytes = bs58.default.decode(res.nonce);
							encryptedDataBytes = bs58.default.decode(res.data);
						} else {
							const res = z
								.object({
									wallet_encryption_public_key: z.string(),
									nonce: z.string(),
									data: z.string(),
								})
								.parse(ctx.query);
							pubKeyBytes = bs58.default.decode(
								res.wallet_encryption_public_key,
							);
							nonceBytes = bs58.default.decode(res.nonce);
							encryptedDataBytes = bs58.default.decode(res.data);
						}

						const nacl = await import("tweetnacl");
						const decrypted = nacl.default.box.open(
							encryptedDataBytes,
							nonceBytes,
							pubKeyBytes,
							appPrivateKeyBytes,
						);

						if (!decrypted) {
							throw new APIError("UNAUTHORIZED", {
								message: "Unauthorized: Failed to decrypt wallet response",
								status: 401,
							});
						}

						const jsonString = new TextDecoder().decode(decrypted);
						const jsonData = JSON.parse(jsonString) as {
							public_key: string;
							session?: string;
						};

						const publicKey = jsonData.public_key;
						const chainType: ChainType = "solana";
						const chainId = DEFAULT_CHAIN_IDS[chainType];
						const accountId = formatAccountId(chainType, chainId, publicKey);

						let user: User | null = null;

						const existingAccount =
							await ctx.context.internalAdapter.findAccountByProviderId(
								accountId,
								"siwx",
							);

						if (existingAccount) {
							user = await ctx.context.internalAdapter.findUserById(
								existingAccount.userId,
							);
						}

						if (!user) {
							const allAccounts = await ctx.context.adapter.findMany<{
								userId: string;
								accountId: string;
							}>({
								model: "account",
								where: [{ field: "providerId", operator: "eq", value: "siwx" }],
							});

							const matchingAccount = allAccounts.find((acc) => {
								const parts = acc.accountId.split(":");
								if (parts.length >= 3) {
									const accAddress = parts.slice(2).join(":");
									return accAddress.toLowerCase() === publicKey.toLowerCase();
								}
								return false;
							});

							if (matchingAccount) {
								user = await ctx.context.internalAdapter.findUserById(
									matchingAccount.userId,
								);
							}

							if (!user) {
								const domain =
									options.emailDomainName ?? getOrigin(ctx.context.baseURL);
								const userEmail = `${publicKey}@${domain}`;

								user = await ctx.context.internalAdapter.createUser({
									name: publicKey,
									email: userEmail,
									image: "",
								});

								await ctx.context.internalAdapter.createAccount({
									userId: user.id,
									providerId: "siwx",
									accountId,
									createdAt: new Date(),
									updatedAt: new Date(),
								});
							}
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

						throw ctx.redirect(`${successRedirect}&provider=${provider}`);
					} catch (error: unknown) {
						if (error instanceof APIError) throw error;
						if (
							error &&
							typeof error === "object" &&
							"status" in error &&
							error.status === 302
						) {
							throw error;
						}
						throw ctx.redirect(
							`${errorRedirect}&provider=${provider}&errorMessage=${encodeURIComponent(error instanceof Error ? error.message : "Unknown error")}`,
						);
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
	NativeCallbackOptions,
	NativeWalletProvider,
	SIWXVerifyMessageArgs,
	SignatureType,
} from "./types";
