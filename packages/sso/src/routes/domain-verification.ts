import {
	APIError,
	createAuthEndpoint,
	sessionMiddleware,
} from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import * as z from "zod";
import type { SSOOptions, SSOProvider } from "../types";
import { parseProviderDomains } from "../utils";
import { checkProviderAccess } from "./providers";

const DNS_LABEL_MAX_LENGTH = 63;
const DEFAULT_TOKEN_PREFIX = "better-auth-token";

const domainVerificationBodySchema = z.object({
	providerId: z.string(),
});

export function getVerificationIdentifier(
	options: SSOOptions,
	providerId: string,
): string {
	const tokenPrefix =
		options.domainVerification?.tokenPrefix || DEFAULT_TOKEN_PREFIX;
	return `_${tokenPrefix}-${providerId}`;
}

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
			const provider = await checkProviderAccess(ctx, body.providerId);

			if (provider.domainVerified) {
				throw new APIError("CONFLICT", {
					message: "Domain has already been verified",
					code: "DOMAIN_VERIFIED",
				});
			}

			const identifier = getVerificationIdentifier(
				options,
				provider.providerId,
			);

			const activeVerification =
				await ctx.context.internalAdapter.findVerificationValue(identifier);

			if (
				activeVerification &&
				new Date(activeVerification.expiresAt) > new Date()
			) {
				ctx.setStatus(201);
				return ctx.json({ domainVerificationToken: activeVerification.value });
			}

			const domainVerificationToken = generateRandomString(24);
			await ctx.context.internalAdapter.createVerificationValue({
				identifier,
				value: domainVerificationToken,
				expiresAt: new Date(Date.now() + 3600 * 24 * 7 * 1000), // 1 week
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
			const provider = await checkProviderAccess(ctx, body.providerId);

			if (provider.domainVerified) {
				throw new APIError("CONFLICT", {
					message: "Domain has already been verified",
					code: "DOMAIN_VERIFIED",
				});
			}

			const identifier = getVerificationIdentifier(
				options,
				provider.providerId,
			);

			if (identifier.length > DNS_LABEL_MAX_LENGTH) {
				throw new APIError("BAD_REQUEST", {
					message: `Verification identifier exceeds the DNS label limit of ${DNS_LABEL_MAX_LENGTH} characters`,
					code: "IDENTIFIER_TOO_LONG",
				});
			}

			const activeVerification =
				await ctx.context.internalAdapter.findVerificationValue(identifier);

			if (
				!activeVerification ||
				new Date(activeVerification.expiresAt) <= new Date()
			) {
				throw new APIError("NOT_FOUND", {
					message: "No pending domain verification exists",
					code: "NO_PENDING_VERIFICATION",
				});
			}

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

			const domains = parseProviderDomains(provider.domain);
			if (!domains) {
				throw new APIError("BAD_REQUEST", {
					message: "Invalid domain",
					code: "INVALID_DOMAIN",
				});
			}

			for (const domain of domains) {
				let records: string[] = [];
				try {
					const dnsRecords = await dns.resolveTxt(`${identifier}.${domain}`);
					records = dnsRecords.map((record) => record.join(""));
				} catch (error) {
					ctx.context.logger.warn(
						`DNS resolution failure while validating domain ownership for ${domain}`,
						error,
					);
				}

				const verificationValue = activeVerification.value;
				const verificationRecord = `${activeVerification.identifier}=${verificationValue}`;
				const record = records.find((record) => {
					const normalizedRecord = record.trim();
					return (
						normalizedRecord === verificationRecord ||
						normalizedRecord === verificationValue
					);
				});
				if (!record) {
					throw new APIError("BAD_GATEWAY", {
						message: `Unable to verify domain ownership for ${domain}. Try again later`,
						code: "DOMAIN_VERIFICATION_FAILED",
					});
				}
			}

			// FIXME(next): this remains a provider-level proof bit. When the next
			// schema can change, store verification per normalized domain or force
			// previously verified multi-domain providers through re-verification.
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
