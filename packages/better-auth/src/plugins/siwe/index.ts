import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";

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

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		siwe: {
			creator: typeof siwe;
		};
	}
}

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

const verifySiweMessageBodyBaseSchema = z.object({
	message: z.string().min(1),
	signature: z.string().min(1),
	walletAddress: walletAddressSchema,
	chainId: chainIdSchema,
	email: z.email().optional(),
});

const createWalletAccountId = (walletAddress: string, chainId: number) =>
	`${walletAddress}:${chainId}`;

const createWalletVerificationIdentifier = (
	walletAddress: string,
	chainId: number,
) => `siwe:${createWalletAccountId(walletAddress, chainId)}`;

const verifySiweMessageOrThrow = async (
	options: SIWEPluginOptions,
	args: {
		message: string;
		signature: string;
		address: string;
		chainId: number;
		nonce: string;
	},
) => {
	try {
		const verified = await options.verifyMessage({
			message: args.message,
			signature: args.signature,
			address: args.address,
			chainId: args.chainId,
			cacao: {
				h: { t: "caip122" },
				p: {
					domain: options.domain,
					aud: options.domain,
					nonce: args.nonce,
					iss: options.domain,
					version: "1",
				},
				s: { t: "eip191", s: args.signature },
			},
		});

		if (!verified) {
			throw APIError.from(
				"UNAUTHORIZED",
				SIWE_ERROR_CODES.INVALID_SIWE_SIGNATURE,
			);
		}
	} catch {
		throw APIError.from(
			"UNAUTHORIZED",
			SIWE_ERROR_CODES.INVALID_SIWE_SIGNATURE,
		);
	}
};

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
					body: verifySiweMessageBodyBaseSchema,
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

					if (!isAnonymous && !email) {
						throw APIError.fromStatus("BAD_REQUEST", {
							message: "Email is required when anonymous is disabled.",
							status: 400,
						});
					}

					const verificationIdentifier = createWalletVerificationIdentifier(
						walletAddress,
						chainId,
					);

					const verification =
						await ctx.context.internalAdapter.findVerificationValue(
							verificationIdentifier,
						);

					if (!verification || new Date() > verification.expiresAt) {
						throw APIError.from(
							"UNAUTHORIZED",
							SIWE_ERROR_CODES.INVALID_OR_EXPIRED_NONCE,
						);
					}

					await verifySiweMessageOrThrow(options, {
						message,
						signature,
						address: walletAddress,
						chainId,
						nonce: verification.value,
					});

					// Nonce is single-use: delete it after successful verification.
					await ctx.context.internalAdapter.deleteVerificationValue(
						verification.id,
					);

					const walletAddressForChain =
						await ctx.context.adapter.findOne<WalletAddress>({
							model: "walletAddress",
							where: [
								{ field: "address", operator: "eq", value: walletAddress },
								{ field: "chainId", operator: "eq", value: chainId },
							],
						});

					const walletAddressAnyChain =
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

					if (shouldLink) {
						const sessionUser = currentSession.user;

						if (
							walletAddressForChain &&
							walletAddressForChain.userId === sessionUser.id
						) {
							return ctx.json({
								token: currentSession.session.token,
								success: true,
								user: { id: sessionUser.id, walletAddress, chainId },
							});
						}

						const walletOwner =
							walletAddressForChain?.userId ?? walletAddressAnyChain?.userId;
						if (walletOwner && walletOwner !== sessionUser.id) {
							throw APIError.from(
								"BAD_REQUEST",
								SIWE_ERROR_CODES.WALLET_ALREADY_LINKED,
							);
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
							user: { id: sessionUser.id, walletAddress, chainId },
						});
					}

					const existingUserId =
						walletAddressForChain?.userId ?? walletAddressAnyChain?.userId;

					let user = existingUserId
						? await ctx.context.adapter.findOne<User>({
								model: "user",
								where: [{ field: "id", operator: "eq", value: existingUserId }],
							})
						: null;

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
					} else if (!walletAddressForChain) {
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
		$ERROR_CODES: SIWE_ERROR_CODES,
	}) satisfies BetterAuthPlugin;
