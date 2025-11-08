import dns from "node:dns/promises";
import type { Verification } from "better-auth";
import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { randomBytes } from "crypto";
import * as z from "zod/v4";
import type { SSOOptions, SSOProvider } from "../types";

export const submitDomainVerification = (options: SSOOptions) => {
	return createAuthEndpoint(
		"/sso/domain-verification",
		{
			method: "POST",
			body: z.object({
				providerId: z.string(),
			}),
			metadata: {
				openapi: {
					summary: "Submit a domain for verification",
					description: "Submit a provider domain for owning verification",
					responses: {
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
			const provider = await ctx.context.adapter.findOne<SSOProvider>({
				model: "ssoProvider",
				where: [{ field: "providerId", value: body.providerId }],
			});

			if (!provider) {
				return Response.json(
					{ message: "Provider not found" },
					{ status: 404 },
				);
			}

			if (provider.domainVerified) {
				return Response.json(
					{ message: "Domain has already been verified" },
					{ status: 409 },
				);
			}

			const verification = await ctx.context.adapter.findOne<Verification>({
				model: "verification",
				where: [
					{
						field: "identifier",
						value: options.domainVerification?.verificationTokenPrefix
							? `${options.domainVerification?.verificationTokenPrefix}-${provider.providerId}`
							: `ba-domain-verification-${provider.providerId}`,
					},
					{ field: "expiresAt", value: new Date(), operator: "lt" },
				],
			});

			if (verification) {
				return Response.json(
					{ message: "Current verification token is still valid" },
					{ status: 409 },
				);
			}

			let domainVerificationToken: string | undefined;

			if (options?.domainVerification?.enabled) {
				domainVerificationToken = randomBytes(24).toString("hex");

				await ctx.context.adapter.create<Verification>({
					model: "verification",
					data: {
						identifier: options.domainVerification?.verificationTokenPrefix
							? `${options.domainVerification?.verificationTokenPrefix}-${provider.providerId}`
							: `ba-domain-verification-${provider.providerId}`,
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

export const verifyDomain = (options: SSOOptions) => {
	return createAuthEndpoint(
		"/sso/domain-verification/verify",
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
						"200": {
							description: "Domain ownership was verified",
						},
					},
				},
			},
			use: [sessionMiddleware],
		},
		async (ctx) => {
			const body = ctx.body;
			const provider = await ctx.context.adapter.findOne<SSOProvider>({
				model: "ssoProvider",
				where: [{ field: "providerId", value: body.providerId }],
			});

			if (!provider) {
				return Response.json(
					{ message: "Provider not found" },
					{ status: 404 },
				);
			}

			if (provider.domainVerified) {
				return Response.json(
					{ message: "Domain has already been verified" },
					{ status: 409 },
				);
			}

			const verification = await ctx.context.adapter.findOne<Verification>({
				model: "verification",
				where: [
					{
						field: "identifier",
						value: options.domainVerification?.verificationTokenPrefix
							? `${options.domainVerification?.verificationTokenPrefix}-${provider.providerId}`
							: `ba-domain-verification-${provider.providerId}`,
					},
					{ field: "expiresAt", value: new Date(), operator: "gt" },
				],
			});

			if (!verification) {
				return Response.json(
					{ message: "No pending domain verification exists" },
					{ status: 404 },
				);
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
				return Response.json(
					{ message: "Unable to verify domain ownership. Try again later" },
					{ status: 404 },
				);
			}

			await ctx.context.adapter.update<SSOProvider>({
				model: "ssoProvider",
				where: [{ field: "providerId", value: provider.providerId }],
				update: {
					domainVerified: true,
				},
			});

			return Response.json({ ok: true }, { status: 200 });
		},
	);
};
