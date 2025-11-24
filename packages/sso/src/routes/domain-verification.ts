import type { Verification } from "better-auth";
import {
	APIError,
	createAuthEndpoint,
	sessionMiddleware,
} from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import * as z from "zod/v4";
import type { SSOOptions, SSOProvider } from "../types";

const domainVerificationBodySchema = z.object({
	providerId: z.string(),
});

export const requestDomainVerification = (options: SSOOptions) => {
	return createAuthEndpoint(
		"/sso/request-domain-verification",
		{
			method: "POST",
			body: domainVerificationBodySchema,
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
							description: "Domain has already been verified",
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
			const provider = await ctx.context.adapter.findOne<
				SSOProvider<SSOOptions>
			>({
				model: "ssoProvider",
				where: [{ field: "providerId", value: body.providerId }],
			});

			if (!provider) {
				throw new APIError("NOT_FOUND", {
					message: "Provider not found",
					code: "PROVIDER_NOT_FOUND",
				});
			}

			const userId = ctx.context.session.user.id;
			let isOrgMember = true;
			if (provider.organizationId) {
				const membershipsCount = await ctx.context.adapter.count({
					model: "member",
					where: [
						{ field: "userId", value: userId },
						{ field: "organizationId", value: provider.organizationId },
					],
				});

				isOrgMember = membershipsCount > 0;
			}

			if (provider.userId !== userId || !isOrgMember) {
				throw new APIError("FORBIDDEN", {
					message:
						"User must be owner of or belong to the SSO provider organization",
					code: "INSUFICCIENT_ACCESS",
				});
			}

			if ("domainVerified" in provider && provider.domainVerified) {
				throw new APIError("CONFLICT", {
					message: "Domain has already been verified",
					code: "DOMAIN_VERIFIED",
				});
			}

			const activeVerification =
				await ctx.context.adapter.findOne<Verification>({
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

			if (activeVerification) {
				ctx.setStatus(201);
				return ctx.json({ domainVerificationToken: activeVerification.value });
			}

			const domainVerificationToken = generateRandomString(24);
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

			ctx.setStatus(201);
			return ctx.json({
				domainVerificationToken,
			});
		},
	);
};

export const verifyDomain = (options: SSOOptions) => {
	return createAuthEndpoint(
		"/sso/verify-domain",
		{
			method: "POST",
			body: domainVerificationBodySchema,
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
			const provider = await ctx.context.adapter.findOne<
				SSOProvider<SSOOptions>
			>({
				model: "ssoProvider",
				where: [{ field: "providerId", value: body.providerId }],
			});

			if (!provider) {
				throw new APIError("NOT_FOUND", {
					message: "Provider not found",
					code: "PROVIDER_NOT_FOUND",
				});
			}

			const userId = ctx.context.session.user.id;
			let isOrgMember = true;
			if (provider.organizationId) {
				const membershipsCount = await ctx.context.adapter.count({
					model: "member",
					where: [
						{ field: "userId", value: userId },
						{ field: "organizationId", value: provider.organizationId },
					],
				});

				isOrgMember = membershipsCount > 0;
			}

			if (provider.userId !== userId || !isOrgMember) {
				throw new APIError("FORBIDDEN", {
					message:
						"User must be owner of or belong to the SSO provider organization",
					code: "INSUFICCIENT_ACCESS",
				});
			}

			if ("domainVerified" in provider && provider.domainVerified) {
				throw new APIError("CONFLICT", {
					message: "Domain has already been verified",
					code: "DOMAIN_VERIFIED",
				});
			}

			const activeVerification =
				await ctx.context.adapter.findOne<Verification>({
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

			if (!activeVerification) {
				throw new APIError("NOT_FOUND", {
					message: "No pending domain verification exists",
					code: "NO_PENDING_VERIFICATION",
				});
			}

			let records: string[] = [];
			let dns: typeof import("node:dns/promises");

			try {
				dns = await import("node:dns/promises");
			} catch (error) {
				ctx.context.logger.error(
					"The core node:dns module is required for the domain verification feature",
					error,
				);
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: "Unable to verify domain ownership due to server error",
					code: "DOMAIN_VERIFICATION_FAILED",
				});
			}

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
			}

			const record = records.find((record) =>
				record.includes(
					`${activeVerification.identifier}=${activeVerification.value}`,
				),
			);
			if (!record) {
				throw new APIError("BAD_GATEWAY", {
					message: "Unable to verify domain ownership. Try again later",
					code: "DOMAIN_VERIFICATION_FAILED",
				});
			}

			await ctx.context.adapter.update<SSOProvider<SSOOptions>>({
				model: "ssoProvider",
				where: [{ field: "providerId", value: provider.providerId }],
				update: {
					domainVerified: true,
				},
			});

			ctx.setStatus(204);
			return;
		},
	);
};
