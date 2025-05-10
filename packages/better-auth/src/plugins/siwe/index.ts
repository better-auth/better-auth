import { APIError, createAuthEndpoint } from "../../api";
import { setSessionCookie } from "../../cookies";
import { z } from "zod";
import type { BetterAuthPlugin } from "../../types";
import type { SiweUser } from "./types";
import { schema } from "./schema";
import { getOrigin } from "../../utils/url";

export interface SIWEPluginOptions {
	domain: string;
	emailDomainName?: string;
	generateSiweNonce: () => Promise<string>;
	verifySiweMessage: (message: string, signature: string, nonce: string) => Promise<boolean>;
	ensLookup?: (walletAddress: string) => Promise<{ name: string; avatar: string }>;

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
					const nonce = await options.generateSiweNonce();
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
					}),
					requireRequest: true,
				},
				async (ctx) => {
					const { message, signature, walletAddress } = ctx.body;

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
						const { value: nonce } = verification;
						const verified = await options.verifySiweMessage(message, signature, nonce);

						if (!verified) {
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
							const domain = options.emailDomainName ?? getOrigin(ctx.context.baseURL);
							const email = `${walletAddress}@${domain}`;
							const { name, avatar } = await options.ensLookup?.(walletAddress) ?? {};
							user = await ctx.context.internalAdapter.createUser({
								name: name ?? walletAddress, // TODO: should fallback to something else other than walletAddress
								email,
								walletAddress,
								avatar: avatar ?? "",
							});
						}

						const session = await ctx.context.internalAdapter.createSession(
							user.id,
							ctx,
						);

						if (!session) {
							throw new APIError("INTERNAL_SERVER_ERROR", {
								message: "Internal Server Error",
								status: 500,
							});
						}

						await setSessionCookie(ctx, { session, user });

						return ctx.json({ token: session.token, success: true });
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
