import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { createLocalAccountIssuer } from "@better-auth/core/db";
import { createPlaceholderEmail } from "@better-auth/core/utils/email";
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
import { toChecksumAddress } from "./utils";

export interface SIWXPluginOptions {
	domain: string;
	emailDomainName?: string | undefined;
	anonymous?: boolean | undefined;
	statement?: string | undefined;
	supportedChains?: ChainType[] | undefined;
	getNonce: () => Promise<string>;
	/**
	 * Verify that `signature` is a valid signature of `message` by `address`.
	 *
	 * `message` is the server-issued challenge (the client must sign it verbatim),
	 * and verify has already confirmed the submitted message matched it exactly,
	 * so the nonce is authoritative. Verify only that the signature is valid for
	 * this message and address.
	 */
	verifyMessage: (args: SIWXVerifyMessageArgs) => Promise<boolean>;
	nameLookup?:
		| ((args: NameLookupArgs) => Promise<NameLookupResult>)
		| undefined;
}

const PROVIDER_ID = "siwx";
const ACCOUNT_ISSUER = createLocalAccountIssuer(PROVIDER_ID);

const DEFAULT_CHAIN_IDS: Record<ChainType, string> = {
	evm: "1",
	solana: "mainnet-beta",
};

const DEFAULT_SIGNATURE_TYPES: Record<ChainType, SignatureType> = {
	evm: "evm:eip191",
	solana: "solana:ed25519",
};

const EVM_ADDRESS_REGEX = /^0[xX][a-fA-F0-9]{40}$/;

function normalizeAddress(chainType: ChainType, address: string): string {
	if (chainType === "evm") {
		// Validate before checksumming. toChecksumAddress assumes a 40 hex char
		// body; a malformed address would otherwise throw a TypeError and surface
		// as a 500 instead of a 400.
		if (!EVM_ADDRESS_REGEX.test(address)) {
			throw new APIError("BAD_REQUEST", {
				message: "Invalid EVM address format",
				status: 400,
				code: "INVALID_EVM_ADDRESS",
			});
		}
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

/**
 * Build the canonical CAIP-122 sign-in message the wallet must sign. The server
 * owns this message so the nonce it contains is authoritative: the client signs
 * exactly this string and sends it back, and verify accepts only an exact match.
 */
function buildSiwxMessage(args: {
	domain: string;
	address: string;
	statement: string;
	chainType: ChainType;
	chainId: string;
	nonce: string;
	issuedAt: string;
}): string {
	const { domain, address, statement, chainType, chainId, nonce, issuedAt } =
		args;
	return [
		`${domain} wants you to sign in with your ${chainType} account:`,
		address,
		"",
		statement,
		"",
		`URI: ${domain}`,
		"Version: 1",
		`Chain ID: ${chainId}`,
		`Nonce: ${nonce}`,
		`Issued At: ${issuedAt}`,
	].join("\n");
}

interface StoredSiwxChallenge {
	nonce: string;
	issuedAt: string;
	message: string;
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
					const issuedAt = new Date().toISOString();
					const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

					// The server builds the canonical message the wallet must sign, so
					// the nonce it carries is authoritative. Persist it alongside the
					// nonce and issued-at so verify can reconstruct the exact same CACAO.
					const message = buildSiwxMessage({
						domain: options.domain,
						address: normalizedAddress,
						statement,
						chainType,
						chainId,
						nonce,
						issuedAt,
					});

					const stored: StoredSiwxChallenge = { nonce, issuedAt, message };
					await ctx.context.internalAdapter.createVerificationValue({
						identifier: `siwx:${chainType}:${chainId}:${normalizedAddress}`,
						value: JSON.stringify(stored),
						expiresAt,
					});

					return ctx.json({
						nonce,
						message,
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
						// Atomically consume the single-use nonce before any signature
						// work or state mutation. The first concurrent request wins; every
						// racer receives null, so the same nonce can never replay a login.
						// Consuming up front (not after verification) also burns the record
						// on a failed attempt and applies the built-in expiry gate.
						const identifier = `siwx:${chainType}:${chainId}:${normalizedAddress}`;
						const verification =
							await ctx.context.internalAdapter.consumeVerificationValue(
								identifier,
							);

						if (!verification) {
							throw new APIError("UNAUTHORIZED", {
								message: "Unauthorized: Invalid or expired nonce",
								status: 401,
								code: "INVALID_OR_EXPIRED_NONCE",
							});
						}

						const stored = JSON.parse(
							verification.value,
						) as StoredSiwxChallenge;
						const { nonce, issuedAt, message: expectedMessage } = stored;

						// The signed message must be exactly the server-issued one. Because
						// the server authored the message (and its nonce), an equality check
						// makes the nonce authoritative: a signature over any other message,
						// even one that merely embeds this nonce, cannot satisfy it.
						if (message !== expectedMessage) {
							throw new APIError("UNAUTHORIZED", {
								message: "Unauthorized: Message does not match the challenge",
								status: 401,
								code: "INVALID_NONCE_BINDING",
							});
						}

						// Rebuild the CAIP-122 CACAO from the stored challenge so its nonce
						// and issued-at match the signed message exactly.
						const cacao: Cacao = {
							h: { t: "caip122" },
							p: {
								domain: options.domain,
								iss: buildCAIP10(chainType, chainId, normalizedAddress),
								aud: options.domain,
								version: "1",
								nonce,
								iat: issuedAt,
								statement,
							},
							s: {
								t: signatureType,
								s: signature,
							},
						};

						// Verify message signature using user-provided verification function
						const verified = await options.verifyMessage({
							message: expectedMessage,
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

						const accountId = formatAccountId(
							chainType,
							chainId,
							normalizedAddress,
						);

						// Look for existing user by their wallet account
						let user: User | null = null;

						// Check if there's an account record for this exact chainType:chainId:address combination
						const existingAccount =
							await ctx.context.internalAdapter.findAccountByKey({
								issuer: ACCOUNT_ISSUER,
								accountId,
							});

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
									{ field: "providerId", operator: "eq", value: PROVIDER_ID },
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
								const walletEmail = options.emailDomainName
									? `${normalizedAddress}@${options.emailDomainName}`
									: createPlaceholderEmail({
											identifier: normalizedAddress,
											namespace: PROVIDER_ID,
										});
								const userEmail = !isAnon && email ? email : walletEmail;
								const { name, avatar } =
									(await options.nameLookup?.({
										address: normalizedAddress,
										chainType,
										chainId,
									})) ?? {};

								user = await ctx.context.internalAdapter.createUser(
									{
										name: name ?? normalizedAddress,
										email: userEmail,
										image: avatar ?? "",
									},
									{ method: PROVIDER_ID },
								);
							}

							// Create account record for this chainType:chainId:address combination
							await ctx.context.internalAdapter.createAccount({
								userId: user.id,
								providerId: PROVIDER_ID,
								issuer: ACCOUNT_ISSUER,
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
						// Log the raw failure server-side only. Returning the underlying
						// message to the client can disclose internal details (a DB
						// exception may carry table, column, or constraint names) on an
						// authentication endpoint.
						ctx.context.logger.error("SIWX verification failed", error);
						throw new APIError("UNAUTHORIZED", {
							message: "Something went wrong. Please try again later.",
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
