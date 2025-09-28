import bs58 from "bs58";
import nacl from "tweetnacl";
import { z } from "zod";
import type {
	AddressValidatorArgs,
	GenerateMessageArgs,
	VerifyMessageArgs,
} from "./types";
import { WalletProviderListEnum, type WalletProviders } from "./providers";
import { generateRandomString } from "../../crypto";
import { setSessionCookie } from "../../cookies";
import type { Account, BetterAuthPlugin, User } from "../../types";
import { APIError, createAuthEndpoint } from "../../api";

// TODO SNS lookup
// TODO used when redirecting to native app, should be available in client
// TODO add typesafe providers like social providers
// TODO expose custom successSchema, errorSchema for native callback
// TODO link account
// TODO make map like social providers
// TODO get origin copy

// native deeplinks
// https://docs.phantom.com/phantom-deeplinks/provider-methods/connect
// https://docs.solflare.com/solflare/technical/deeplinks/provider-methods/connect
// https://docs.backpack.app/deeplinks/provider-methods/connect

function getOrigin(url: string) {
	try {
		const parsedUrl = new URL(url);
		return parsedUrl.hostname;
	} catch (error) {
		return null;
	}
}

export const ERROR_CODES = {
	INVALID_PROVIDER: "Invalid provider",
	INVALID_OR_EXPIRED_NONCE: "Invalid or expired nonce",
	INVALID_ADDRESS_OR_SIGNATURE: "Invalid address or signature",
	FAILED_TO_CREATE_USER: "Failed to create user",
	FAILED_TO_CREATE_SESSION: "Failed to create session",
	USER_ALREADY_EXISTS: "User already exists",
};

function defaultGetNonce() {
	// generate a cryptographically secure random nonce
	return generateRandomString(32);
}

function defaultAddressValidator(args: AddressValidatorArgs): boolean {
	try {
		const decoded = bs58.decode(args.publicKey);
		return decoded.length === 32;
	} catch (e) {
		return false;
	}
}

function defaultGenerateMessage(args: GenerateMessageArgs) {
	return `Sign this message to log in to the app:

Address: ${args.publicKey}
Nonce: ${args.nonce}`;
}

function defaultVerifyMessage(args: VerifyMessageArgs) {
	try {
		const msgUint8 = new TextEncoder().encode(args.message);
		const sigUint8 = bs58.decode(args.signature);
		const pubKeyUint8 = bs58.decode(args.publicKey);

		const isValid = nacl.sign.detached.verify(msgUint8, sigUint8, pubKeyUint8);
		return isValid;
	} catch (error) {
		return false;
	}
}

export interface SIWSOptions {
	/**
	 * // TODO docs
	 * Base58 public and private keys handling native app deeplinks and callbacks
	 * // TODO keypair generate command
	 */
	callback?: {
		/**
		 * Used when redirecting to native app to encrypt the native callback payload
		 * Should be a base58 public key
		 */
		appPublicKeyBase58: string;
		/**
		 * Used for decrypting the native callback payload
		 * Should be a base58 private key
		 */
		appPrivateKeyBase58: string;
		allowedCallbackProviders?: WalletProviders;
	};
	emailDomainName?: string;
	/**
	 * A function to generate a cryptographically secure random nonce
	 */
	getNonce?: () => string | Promise<string>;
	/**
	 * A function to validate the publicKey
	 *
	 * By default, the publicKey should be a valid base58 publicKey
	 */
	addressValidator?: (args: AddressValidatorArgs) => boolean | Promise<boolean>;
	/**
	 * A function to generate a message for the user the sign
	 */
	generateMessage?: (args: GenerateMessageArgs) => string | Promise<string>;
	/**
	 * A function to verify the generated message
	 */
	verifyMessage?: (args: VerifyMessageArgs) => string | Promise<string>;
}

export const siws = (options: SIWSOptions) => {
	return {
		id: "siws",
		endpoints: {
			createNonce: createAuthEndpoint(
				"/siws/create-nonce",
				{
					method: "POST",
					body: z.object({
						publicKey: z.string(),
					}),
				},
				async (ctx) => {
					const { publicKey } = ctx.body;

					const nonceGenerator = options.getNonce || defaultGetNonce;
					const nonce = await nonceGenerator();

					const validator = options.addressValidator || defaultAddressValidator;
					const validateResult = await validator({
						publicKey: publicKey,
					});

					if (!validateResult) {
						ctx.context.logger.error("Invalid address", {
							publicKey: publicKey,
						});
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_ADDRESS_OR_SIGNATURE,
						});
					}

					const identifier = `siws:${publicKey}`;

					try {
						await ctx.context.internalAdapter.createVerificationValue(
							{
								identifier: identifier,
								value: nonce,
								expiresAt: new Date(Date.now() + 5 * 60 * 1000),
							},
							ctx,
						);
					} catch (error) {
						// might be duplicate key error
						await ctx.context.internalAdapter.deleteVerificationByIdentifier(
							identifier,
						);
						//try again
						await ctx.context.internalAdapter.createVerificationValue(
							{
								identifier: identifier,
								value: nonce,
								expiresAt: new Date(Date.now() + 5 * 60 * 1000),
							},
							ctx,
						);
					}

					const messageGenerator =
						options.generateMessage || defaultGenerateMessage;

					const message = await messageGenerator({
						publicKey: publicKey,
						nonce: nonce,
					});

					return ctx.json({
						success: true,
						message: message,
					});
				},
			),
			signIn: createAuthEndpoint(
				"/siws/sign-in",
				{
					method: "POST",
					body: z.object({
						publicKey: z.string(),
						signature: z.string(),
						message: z.string(),
						provider: WalletProviderListEnum.optional(),
						email: z.string().email().optional(),
						callbackURL: z
							.string({
								error: "Callback URL to use as a redirect",
							})
							.optional(),
					}),
				},
				async (ctx) => {
					const { publicKey, signature, message, email, provider } = ctx.body;

					const validator = options.addressValidator || defaultAddressValidator;
					const validateResult = await validator({
						publicKey: publicKey,
					});

					if (!validateResult) {
						ctx.context.logger.error("Invalid address", {
							publicKey: publicKey,
						});
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_ADDRESS_OR_SIGNATURE,
						});
					}

					const identifier = `siws:${publicKey}`;

					const verification =
						await ctx.context.internalAdapter.findVerificationValue(identifier);

					if (!verification) {
						ctx.context.logger.error("Verification not found", {
							publicKey: publicKey,
						});
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_OR_EXPIRED_NONCE,
						});
					}
					if (new Date() > verification.expiresAt) {
						ctx.context.logger.error("Expired verification nonce", {
							publicKey: publicKey,
						});
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_OR_EXPIRED_NONCE,
						});
					}

					const generator = options.generateMessage || defaultGenerateMessage;

					const verificationMessage = await generator({
						publicKey: publicKey,
						nonce: verification.value,
					});

					if (verificationMessage !== message) {
						ctx.context.logger.error("Invalid nonce", {
							publicKey: publicKey,
						});
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_OR_EXPIRED_NONCE,
						});
					}

					// verify signature
					const verifier = options.verifyMessage ?? defaultVerifyMessage;
					const isValid = verifier({
						message: message,
						signature: signature,
						publicKey: publicKey,
					});
					if (!isValid) {
						ctx.context.logger.error("Invalid signature", {
							publicKey: publicKey,
						});
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_ADDRESS_OR_SIGNATURE,
						});
					}

					// Look for existing user by their siws accounts
					let user: User | null = null;

					// Check if there's an account this publicKey
					const existingAccount: Account | null =
						await ctx.context.adapter.findOne({
							model: "account",
							where: [
								{
									field: "providerId",
									operator: "starts_with",
									value: "siws",
								},
								{
									field: "accountId",
									operator: "eq",
									value: publicKey,
								},
							],
						});

					if (existingAccount) {
						user = await ctx.context.adapter.findOne<User>({
							model: "user",
							where: [
								{
									field: "id",
									operator: "eq",
									value: existingAccount.userId,
								},
							],
						});
					}

					if (!user) {
						const domain =
							options.emailDomainName ?? getOrigin(ctx.context.baseURL);
						const userEmail = email
							? email
							: `siws-${generateRandomString(8, "a-z", "0-9")}@${domain}`;

						try {
							user = await ctx.context.internalAdapter.createUser(
								{
									name: publicKey,
									email: userEmail,
									emailVerified: false,
									image: null,
								},
								ctx,
							);
							if (!user) {
								throw new APIError("BAD_REQUEST", {
									message: ERROR_CODES.FAILED_TO_CREATE_USER,
								});
							}
						} catch (e) {
							if (e instanceof APIError) {
								throw e;
							}
							throw new APIError("UNPROCESSABLE_ENTITY", {
								message: ERROR_CODES.FAILED_TO_CREATE_USER,
								details: e,
							});
						}
						if (!user) {
							throw new APIError("UNPROCESSABLE_ENTITY", {
								message: ERROR_CODES.FAILED_TO_CREATE_USER,
							});
						}
						await ctx.context.internalAdapter.linkAccount(
							{
								userId: user.id,
								providerId: provider ? `siws:${provider}` : "siws",
								accountId: publicKey,
							},
							ctx,
						);
					}

					const account = await ctx.context.adapter.findOne<Account>({
						model: "account",
						where: [
							{
								field: "userId",
								operator: "eq",
								value: user.id,
							},
							{
								field: "providerId",
								value: "siws",
								operator: "starts_with",
							},
							{
								field: "accountId",
								operator: "eq",
								value: publicKey,
							},
						],
					});
					if (!account) {
						ctx.context.logger.error("Account not found", {
							publicKey: publicKey,
						});
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_ADDRESS_OR_SIGNATURE,
						});
					}

					const session = await ctx.context.internalAdapter.createSession(
						user.id,
						ctx,
						true,
					);

					if (!session) {
						ctx.context.logger.error("Failed to create session");
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.FAILED_TO_CREATE_SESSION,
						});
					}

					await setSessionCookie(ctx, {
						session,
						user: user,
					});

					await ctx.context.internalAdapter.deleteVerificationByIdentifier(
						identifier,
					);

					return ctx.json({
						redirect: !!ctx.body.callbackURL,
						token: session.token,
						url: ctx.body.callbackURL,
						user: {
							id: user.id,
							name: user.name,
							email: user.email,
							emailVerified: user.emailVerified,
							image: user.image,
							createdAt: user.createdAt,
							updatedAt: user.updatedAt,
						},
					});
				},
			),
			callback: createAuthEndpoint(
				"/siws/callback/:id",
				{
					method: "GET",
					query: z.record(z.string(), z.string()),
				},
				async (ctx) => {
					const provider = ctx.params.id;

					if (!options.callback?.appPrivateKeyBase58) {
						ctx.context.logger.error(
							`Invalid app private key, ${provider}`,
							{},
						);
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: ERROR_CODES.INVALID_PROVIDER,
						});
					}

					if ("errorCode" in ctx.query) {
						const res = z
							.object({
								errorCode: z.string(),
								errorMessage: z.string(),
							})
							.parse(ctx.query);

						const errorCode = res.errorCode;
						const errorMessage = res.errorMessage;
						ctx.context.logger.error(`Failed to login ${provider}`, {
							errorCode: errorCode,
							errorMessage: errorMessage,
						});
						throw ctx.redirect(
							`/login?success=false&provider=${provider}&errorCode=${encodeURIComponent(errorCode)}&errorMessage=${encodeURIComponent(errorMessage)}`,
						);
					}

					let pubKeyBytes: Uint8Array<ArrayBufferLike>;
					let nonceBytes: Uint8Array<ArrayBufferLike>;
					let encryptedDataBytes: Uint8Array<ArrayBufferLike>;
					const appPrivateKeyBytes = bs58.decode(
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
						pubKeyBytes = bs58.decode(res.phantom_encryption_public_key);
						nonceBytes = bs58.decode(res.nonce);
						encryptedDataBytes = bs58.decode(res.data);
					} else if (provider === "solflare") {
						const res = z
							.object({
								solflare_encryption_public_key: z.string(),
								nonce: z.string(),
								data: z.string(),
							})
							.parse(ctx.query);
						pubKeyBytes = bs58.decode(res.solflare_encryption_public_key);
						nonceBytes = bs58.decode(res.nonce);
						encryptedDataBytes = bs58.decode(res.data);
					} else {
						ctx.context.logger.error(`Invalid provider ${provider}`, {});
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.INVALID_PROVIDER,
						});
					}

					const decrypted = nacl.box.open(
						encryptedDataBytes,
						nonceBytes,
						pubKeyBytes,
						appPrivateKeyBytes,
					);

					if (!decrypted) {
						ctx.context.logger.error(
							`Failed to decrypt ${provider} response`,
							{},
						);
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_ADDRESS_OR_SIGNATURE,
						});
					}

					// Convert to string and parse JSON
					const jsonString = new TextDecoder().decode(decrypted);
					const jsonData = JSON.parse(jsonString) as {
						public_key: string;
						session: string;
					};

					const publicKey = jsonData.public_key;

					let user: User | null = null;

					const existingAccount: Account | null =
						await ctx.context.adapter.findOne({
							model: "account",
							where: [
								{
									field: "providerId",
									operator: "starts_with",
									value: "siws",
								},
								{
									field: "accountId",
									operator: "eq",
									value: publicKey,
								},
							],
						});

					if (existingAccount) {
						user = await ctx.context.adapter.findOne<User>({
							model: "user",
							where: [
								{
									field: "id",
									operator: "eq",
									value: existingAccount.userId,
								},
							],
						});
					}

					const domain =
						options.emailDomainName ?? getOrigin(ctx.context.baseURL);
					const userEmail = `siws-${generateRandomString(8, "a-z", "0-9")}@${domain}`;

					if (!user) {
						try {
							user = await ctx.context.internalAdapter.createUser(
								{
									name: publicKey,
									email: userEmail,
									emailVerified: false,
									image: null,
								},
								ctx,
							);
							if (!user) {
								throw new APIError("BAD_REQUEST", {
									message: ERROR_CODES.FAILED_TO_CREATE_USER,
								});
							}
						} catch (e) {
							// if (isDevelopment) {
							//   ctx.context.logger.error("Failed to create user", e);
							// }
							if (e instanceof APIError) {
								throw e;
							}
							throw new APIError("UNPROCESSABLE_ENTITY", {
								message: ERROR_CODES.FAILED_TO_CREATE_USER,
								details: e,
							});
						}
						if (!user) {
							throw new APIError("UNPROCESSABLE_ENTITY", {
								message: ERROR_CODES.FAILED_TO_CREATE_USER,
							});
						}
						await ctx.context.internalAdapter.linkAccount(
							{
								userId: user.id,
								providerId: `siws:${provider}`,
								accountId: publicKey,
							},
							ctx,
						);
					}

					const account = await ctx.context.adapter.findOne<Account>({
						model: "account",
						where: [
							{
								field: "userId",
								operator: "eq",
								value: user.id,
							},
							{
								field: "providerId",
								value: "siws",
								operator: "starts_with",
							},
							{
								field: "accountId",
								operator: "eq",
								value: publicKey,
							},
						],
					});
					if (!account) {
						ctx.context.logger.error("Account not found", {
							publicKey: publicKey,
						});
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_ADDRESS_OR_SIGNATURE,
						});
					}

					const session = await ctx.context.internalAdapter.createSession(
						user.id,
						ctx,
						true,
					);

					if (!session) {
						ctx.context.logger.error("Failed to create session");
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.FAILED_TO_CREATE_SESSION,
						});
					}

					await setSessionCookie(ctx, {
						session,
						user: user,
					});

					throw ctx.redirect(
						`/?success=true&provider=${provider}`,
					);
				},
			),
		},
		$ERROR_CODES: ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
