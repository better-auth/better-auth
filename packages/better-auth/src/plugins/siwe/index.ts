import { APIError, createAuthEndpoint } from "../../api";
import { setSessionCookie } from "../../cookies";
import { SiweMessage, generateNonce } from "siwe";
import { z } from "zod";
import type { BetterAuthPlugin } from "../../types";
import type { SiweUser } from "./types";
import { schema } from "./schema";
import { getOrigin } from "../../utils/url";

export interface SIWEPluginOptions {
	domain: string;
	suppressSiweExceptions?: boolean;
	emailDomainName?: string;
}

export const siwe = (options: SIWEPluginOptions) =>
	({
		id: "siwe",
		schema,
		endpoints: {
			// Generate nonce endpoint
			nonce: createAuthEndpoint(
				"/siwe/nonce",
				{
					method: "POST",
					body: z.object({
						walletAddress: z
							.string()
							.regex(/^0x[a-fA-F0-9]{40}$/)
							.transform((value) => value.toLowerCase()),
					}),
				},
				async (ctx) => {
					const { walletAddress } = ctx.body;
					const nonce = generateNonce();
					// Store nonce with 15-minute expiration
					await ctx.context.internalAdapter.createVerificationValue({
						identifier: `siwe:${walletAddress.toLowerCase()}`,
						value: nonce,
						expiresAt: new Date(Date.now() + 15 * 60 * 1000),
					});

					return { nonce };
				},
			),
			// Verify siwe payload
			verify: createAuthEndpoint(
				"/siwe/verify",
				{
					method: "POST",
					body: z.object({
						message: z.string(),
						signature: z.string(),
						walletAddress: z.string(),
						ensName: z.string().optional(),
					}),
					requireRequest: true,
				},
				async (ctx) => {
					const { message, signature, walletAddress, ensName } = ctx.body;
					// Parse and validate SIWE message

					const siweMessage = new SiweMessage(message);

					try {
						// Find stored nonce to check it's validity
						const verification =
							await ctx.context.internalAdapter.findVerificationValue(
								`siwe:${walletAddress.toLowerCase()}`,
							);
						// Ensure nonce is valid and not expired
						if (!verification || new Date() > verification.expiresAt) {
							throw new APIError("UNAUTHORIZED", {
								message: "Unauthorized: Invalid or expired nonce",
								status: 401,
							});
						}
						// Verify SIWE message
						const verified = await siweMessage.verify(
							{
								signature,
								nonce: verification.value,
								domain: options.domain,
							},
							{
								suppressExceptions: options.suppressSiweExceptions,
							},
						);

						if (!verified.success) {
							throw new APIError("UNAUTHORIZED", {
								message: "Unauthorized: Invalid SIWE signature",
								status: 401,
							});
						}

						await ctx.context.internalAdapter.deleteVerificationValue(
							verification.id,
						);

						let user: SiweUser | null = await ctx.context.adapter.findOne({
							model: "user",
							where: [
								{
									field: "walletAddress",
									operator: "eq",
									value: walletAddress,
								},
							],
						});

						if (!user) {
							const { emailDomainName = getOrigin(ctx.context.baseURL) } = options || {};
							const email = `${walletAddress}@${emailDomainName}`;
							user = await ctx.context.internalAdapter.createUser({
								name: ensName ?? walletAddress, // TODO: should fallback to something else other than walletAddress
								email,
								walletAddress,
							});
						}

						const session = await ctx.context.internalAdapter.createSession(
							user.id,
							ctx,
						);

						if (!session) {
							return ctx.json(null, {
								status: 500,
								body: {
									message: "Internal Server Error",
									status: "500",
								},
							});
						}

						await setSessionCookie(ctx, { session, user });

						return ctx.json({ token: session.token });
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
