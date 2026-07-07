import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { APIError } from "../../api";
import { setSessionCookie } from "../../cookies";
import { mergeSchema } from "../../db/schema";
import type { InferOptionSchema, User } from "../../types";
import { isAPIError } from "../../utils/is-api-error";
import { getOrigin } from "../../utils/url";
import { PACKAGE_VERSION } from "../../version";
import type { SolanaWalletAddressSchema } from "./schema";
import { schema } from "./schema";
import type {
	SIWSVerifyArgs,
	SolanaSignInOutput,
	SolanaWalletAddress,
} from "./types";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		siws: {
			creator: typeof siws;
		};
	}
}

export interface SIWSPluginOptions {
	domain: string;
	emailDomainName?: string | undefined;
	anonymous?: boolean | undefined;
	getNonce: () => Promise<string>;
	/**
	 * Verify the SIWS input/output pair. Drop in `verifySignIn` from
	 * `@solana/wallet-standard-util`, or supply your own Ed25519 verifier.
	 */
	verifySignIn: (args: SIWSVerifyArgs) => Promise<boolean>;
	schema?: InferOptionSchema<typeof schema> | undefined;
}

// Solana base58 alphabet excludes 0, O, I, l — 32–44 chars for a 32-byte pubkey.
const solanaAddressSchema = z
	.string()
	.regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid Solana address format");

const siwsInputSchema = z.object({
	domain: z.string().optional(),
	address: z.string().optional(),
	statement: z.string().optional(),
	uri: z.string().optional(),
	version: z.string().optional(),
	nonce: z.string().optional(),
	chainId: z.string().optional(),
	issuedAt: z.string().optional(),
	expirationTime: z.string().optional(),
	notBefore: z.string().optional(),
	requestId: z.string().optional(),
	resources: z.array(z.string()).optional(),
});

const siwsOutputWireSchema = z.object({
	account: z.object({
		address: z.string(),
		publicKey: z.string(), // base64-encoded 32-byte Ed25519 public key
	}),
	signature: z.string(), // base64-encoded Ed25519 signature (64 bytes)
	signedMessage: z.string(), // base64-encoded bytes the wallet signed
});

function base64ToUint8Array(b64: string): Uint8Array {
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

export const siws = (options: SIWSPluginOptions) => {
	return {
		id: "siws",
		version: PACKAGE_VERSION,
		schema: mergeSchema(schema, options?.schema) as SolanaWalletAddressSchema,
		endpoints: {
			getSiwsNonce: createAuthEndpoint(
				"/siws/nonce",
				{
					method: "POST",
					body: z.object({
						address: solanaAddressSchema,
					}),
				},
				async (ctx) => {
					const { address } = ctx.body;
					const nonce = await options.getNonce();

					await ctx.context.internalAdapter.createVerificationValue({
						identifier: `siws:${address}`,
						value: nonce,
						expiresAt: new Date(Date.now() + 15 * 60 * 1000),
					});

					return ctx.json({ nonce });
				},
			),

			verifySiwsMessage: createAuthEndpoint(
				"/siws/verify",
				{
					method: "POST",
					body: z
						.object({
							address: solanaAddressSchema,
							input: siwsInputSchema,
							output: siwsOutputWireSchema,
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
					const { address, input, output: rawOutput, email } = ctx.body;
					const isAnon = options.anonymous ?? true;

					if (!isAnon && !email) {
						throw APIError.fromStatus("BAD_REQUEST", {
							message: "Email is required when anonymous is disabled.",
							status: 400,
						});
					}

					try {
						// Atomically consume the nonce — first concurrent request wins.
						const verification =
							await ctx.context.internalAdapter.consumeVerificationValue(
								`siws:${address}`,
							);

						if (!verification) {
							throw APIError.fromStatus("UNAUTHORIZED", {
								message: "Unauthorized: Invalid or expired nonce",
								status: 401,
								code: "UNAUTHORIZED_INVALID_OR_EXPIRED_NONCE",
							});
						}

						const { value: nonce } = verification;

						// Bind the signed input to server-issued state. The nonce must be
						// present and match; domain and address are validated when provided
						// so a wallet cannot substitute fields after the nonce was issued.
						if (!input.nonce) {
							throw APIError.fromStatus("UNAUTHORIZED", {
								message:
									"Unauthorized: SIWS input must include the server-issued nonce",
								status: 401,
								code: "UNAUTHORIZED_SIWS_NONCE_MISMATCH",
							});
						}

						if (input.nonce !== nonce) {
							throw APIError.fromStatus("UNAUTHORIZED", {
								message:
									"Unauthorized: SIWS input nonce does not match the server-issued nonce",
								status: 401,
								code: "UNAUTHORIZED_SIWS_NONCE_MISMATCH",
							});
						}

						if (input.domain !== undefined && input.domain !== options.domain) {
							throw APIError.fromStatus("UNAUTHORIZED", {
								message:
									"Unauthorized: SIWS input domain does not match the server domain",
								status: 401,
								code: "UNAUTHORIZED_SIWS_DOMAIN_MISMATCH",
							});
						}

						if (input.address !== undefined && input.address !== address) {
							throw APIError.fromStatus("UNAUTHORIZED", {
								message:
									"Unauthorized: SIWS input address does not match the request address",
								status: 401,
								code: "UNAUTHORIZED_SIWS_ADDRESS_MISMATCH",
							});
						}

						const now = Date.now();
						if (input.expirationTime) {
							const expiresAt = Date.parse(input.expirationTime);
							if (!Number.isNaN(expiresAt) && now >= expiresAt) {
								throw APIError.fromStatus("UNAUTHORIZED", {
									message: "Unauthorized: SIWS input has expired",
									status: 401,
									code: "UNAUTHORIZED_SIWS_INPUT_EXPIRED",
								});
							}
						}
						if (input.notBefore) {
							const notBefore = Date.parse(input.notBefore);
							if (!Number.isNaN(notBefore) && now < notBefore) {
								throw APIError.fromStatus("UNAUTHORIZED", {
									message: "Unauthorized: SIWS input is not yet valid",
									status: 401,
									code: "UNAUTHORIZED_SIWS_INPUT_NOT_YET_VALID",
								});
							}
						}

						// Decode base64 wire bytes to Uint8Array before passing to the verifier.
						let publicKeyBytes: Uint8Array;
						let signatureBytes: Uint8Array;
						let signedMessageBytes: Uint8Array;
						try {
							publicKeyBytes = base64ToUint8Array(rawOutput.account.publicKey);
							signatureBytes = base64ToUint8Array(rawOutput.signature);
							signedMessageBytes = base64ToUint8Array(rawOutput.signedMessage);
						} catch {
							throw APIError.fromStatus("UNAUTHORIZED", {
								message: "Unauthorized: Invalid base64 encoding in output",
								status: 401,
							});
						}

						const output: SolanaSignInOutput = {
							account: {
								address: rawOutput.account.address,
								publicKey: publicKeyBytes,
								chains: [],
								features: [],
							},
							signature: signatureBytes,
							signedMessage: signedMessageBytes,
							signatureType: "ed25519",
						};

						const verified = await options.verifySignIn({ input, output });

						if (!verified) {
							throw APIError.fromStatus("UNAUTHORIZED", {
								message: "Unauthorized: Invalid SIWS signature",
								status: 401,
							});
						}

						// Find existing user by Solana wallet address.
						let user: User | null = null;

						const existingWallet: SolanaWalletAddress | null =
							await ctx.context.adapter.findOne({
								model: "solanaWalletAddress",
								where: [{ field: "address", operator: "eq", value: address }],
							});

						if (existingWallet) {
							user = await ctx.context.adapter.findOne({
								model: "user",
								where: [
									{ field: "id", operator: "eq", value: existingWallet.userId },
								],
							});
						}

						if (!user) {
							const domain =
								options.emailDomainName ?? getOrigin(ctx.context.baseURL);
							const normalizedEmail = email?.toLowerCase();
							// Wallet proves key control, not email ownership. Only bind the
							// caller email when it is unclaimed; otherwise fall back to the
							// wallet-derived address to avoid silent account takeovers.
							let userEmail = `${address}@${domain}`;
							if (!isAnon && normalizedEmail) {
								const existingUser =
									await ctx.context.internalAdapter.findUserByEmail(
										normalizedEmail,
									);
								if (!existingUser) {
									userEmail = normalizedEmail;
								}
							}

							user = await ctx.context.internalAdapter.createUser({
								name: `${address.slice(0, 4)}...${address.slice(-4)}`,
								email: userEmail,
								image: "",
							});

							await ctx.context.adapter.create({
								model: "solanaWalletAddress",
								data: {
									userId: user.id,
									address,
									isPrimary: true,
									createdAt: new Date(),
								},
							});

							await ctx.context.internalAdapter.createAccount({
								userId: user.id,
								providerId: "siws",
								accountId: address,
								createdAt: new Date(),
								updatedAt: new Date(),
							});
						}

						const session = await ctx.context.internalAdapter.createSession(
							user.id,
						);

						if (!session) {
							throw APIError.fromStatus("INTERNAL_SERVER_ERROR", {
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
								address,
							},
						});
					} catch (error: unknown) {
						if (isAPIError(error)) throw error;
						throw APIError.fromStatus("UNAUTHORIZED", {
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
