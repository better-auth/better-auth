import type { Verification } from "better-auth";
import {
	APIError,
	createAuthEndpoint,
	sessionMiddleware,
} from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import dns from "dns/promises";
import * as z from "zod/v4";
import type { SSOOptions, SSOProvider } from "../types";

export const requestDomainVerification = <O extends SSOOptions>(options: O) => {
	return createAuthEndpoint(
		"/sso/request-domain-verification",
		{
			method: "POST",
			body: z.object({
				providerId: z.string(),
			}),
			metadata: {
				openapi: {
					summary: "Request a domain verification",
					description:
						"Request a domain verification for the given SSO provider",
					responses: {
						"404": {
							description: "Provider not found",
						},
						"409": {
							description:
								"Domain has already been verified or current verification token is still valid",
						},
						"201": {
							description: "Domain submitted for verification",
						},
					},
				},
			},
			use: [sessionMiddleware],
		},
		async (ctx) => {
			const body = ctx.body;
			const provider = await ctx.context.adapter.findOne<SSOProvider<O>>({
				model: "ssoProvider",
				where: [{ field: "providerId", value: body.providerId }],
			});

			if (!provider) {
				throw new APIError("NOT_FOUND", {
					message: "Provider not found",
					code: "PROVIDER_NOT_FOUND",
				});
			}

			if ("domainVerified" in provider && provider.domainVerified) {
				throw new APIError("CONFLICT", {
					message: "Domain has already been verified",
					code: "DOMAIN_VERIFIED",
				});
			}

			const verification = await ctx.context.adapter.findOne<Verification>({
				model: "verification",
				where: [
					{
						field: "identifier",
						value: options.domainVerification?.tokenPrefix
							? `${options.domainVerification?.tokenPrefix}-${provider.providerId}`
							: `better-auth-token-${provider.providerId}`,
					},
					{ field: "expiresAt", value: new Date(), operator: "lt" },
				],
			});

			if (verification) {
				throw new APIError("CONFLICT", {
					message: "Current verification token is still valid",
					code: "TOKEN_FOUND",
				});
			}

			let domainVerificationToken: string | undefined;

			if (options?.domainVerification?.enabled) {
				domainVerificationToken = generateRandomString(24);

				await ctx.context.adapter.create<Verification>({
					model: "verification",
					data: {
						identifier: options.domainVerification?.tokenPrefix
							? `${options.domainVerification?.tokenPrefix}-${provider.providerId}`
							: `better-auth-token-${provider.providerId}`,
						createdAt: new Date(),
						updatedAt: new Date(),
						value: domainVerificationToken,
						expiresAt: new Date(Date.now() + 3600 * 24 * 7 * 1000), // 1 week
					},
				});
			}

			return Response.json(
				{
					domainVerificationToken,
				},
				{ status: 201 },
			);
		},
	);
};

export const verifyDomain = <O extends SSOOptions>(options: O) => {
	return createAuthEndpoint(
		"/sso/verify-domain",
		{
			method: "POST",
			body: z.object({
				providerId: z.string(),
			}),
			metadata: {
				openapi: {
					summary: "Verify the provider domain ownership",
					description: "Verify the provider domain ownership via DNS records",
					responses: {
						"404": {
							description: "Provider not found",
						},
						"409": {
							description:
								"Domain has already been verified or no pending verification exists",
						},
						"502": {
							description:
								"Unable to verify domain ownership due to upstream validator error",
						},
						"204": {
							description: "Domain ownership was verified",
						},
					},
				},
			},
			use: [sessionMiddleware],
		},
		async (ctx) => {
			const body = ctx.body;
			const provider = await ctx.context.adapter.findOne<SSOProvider<O>>({
				model: "ssoProvider",
				where: [{ field: "providerId", value: body.providerId }],
			});

			if (!provider) {
				throw new APIError("NOT_FOUND", {
					message: "Provider not found",
					code: "PROVIDER_NOT_FOUND",
				});
			}

			if ("domainVerified" in provider && provider.domainVerified) {
				throw new APIError("CONFLICT", {
					message: "Domain has already been verified",
					code: "DOMAIN_VERIFIED",
				});
			}

			const verification = await ctx.context.adapter.findOne<Verification>({
				model: "verification",
				where: [
					{
						field: "identifier",
						value: options.domainVerification?.tokenPrefix
							? `${options.domainVerification?.tokenPrefix}-${provider.providerId}`
							: `better-auth-token-${provider.providerId}`,
					},
					{ field: "expiresAt", value: new Date(), operator: "gt" },
				],
			});

			if (!verification) {
				throw new APIError("NOT_FOUND", {
					message: "No pending domain verification exists",
					code: "NO_PENDING_VERIFICATION",
				});
			}

			let records: string[];
			try {
				const dnsRecords = await dns.resolveTxt(
					new URL(provider.domain).hostname,
				);
				records = dnsRecords.flat();
			} catch (error) {
				ctx.context.logger.warn(
					"DNS resolution failure while validating domain ownership",
					error,
				);
				records = [];
			}

			const record = records.find((record) =>
				record.includes(`${verification.identifier}=${verification.value}`),
			);
			if (!record) {
				throw new APIError("BAD_GATEWAY", {
					message: "Unable to verify domain ownership. Try again later",
					code: "DOMAIN_VERIFICATION_FAILED",
				});
			}

			await ctx.context.adapter.update<SSOProvider<O>>({
				model: "ssoProvider",
				where: [{ field: "providerId", value: provider.providerId }],
				update: {
					domainVerified: true,
				},
			});

			return new Response(null, { status: 204 });
		},
	);
};
