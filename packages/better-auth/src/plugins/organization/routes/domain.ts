import { z } from "zod/v4";
import { createAuthEndpoint } from "../../../api/call";
import { APIError } from "better-call";
import { OrganizationOptions } from "../types";
import { getOrgAdapter } from "../adapter";
import { orgSessionMiddleware } from "../call";
import { hasPermission } from "../has-permission";
import { generateId } from "../../../utils";
import { query } from 'dns-query';

export const addCustomDomain = <O extends OrganizationOptions>() =>
    createAuthEndpoint(
        "/organization/:orgId/domain",
        {
            method: "POST",
            body: z.object({
                domain: z.string().min(1),
            }),
            use: [orgSessionMiddleware],
        },
        async (ctx) => {
            const { orgId } = ctx.req.param() as { orgId: string };
            const { domain } = ctx.body;

            const adapter = getOrgAdapter(ctx.context, ctx.orgOptions);

            const permission = hasPermission({
                role: ctx.org.role,
                options: ctx.orgOptions,
                permissions: { 'org:domain': ["create"] }
            });

            if (!permission) {
                throw new APIError("FORBIDDEN");
            }

            const org = await adapter.findOrganizationById(orgId);
            if (org.customDomain && !org.customDomainVerified) {
                throw new APIError("CONFLICT", { message: "A domain is already pending verification" });
            }

            // Basic domain validation
            const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/;
            if (!domainRegex.test(domain)) {
                throw new APIError("BAD_REQUEST", { message: "Invalid domain format" });
            }

            const existingOrg = await adapter.findOrganizationByDomain(domain);
            if (existingOrg) {
                throw new APIError("CONFLICT", { message: "Domain is already in use" });
            }

            const verificationToken = generateId();

            await adapter.updateOrganization(orgId, { 
                customDomain: domain,
                customDomainVerified: false,
                customDomainVerificationToken: verificationToken,
            });

            return ctx.json({
                success: true,
                verificationToken,
            });
        }
    );

export const verifyCustomDomain = <O extends OrganizationOptions>() =>
    createAuthEndpoint(
        "/organization/:orgId/domain/verify",
        {
            method: "POST",
            use: [orgSessionMiddleware],
        },
        async (ctx) => {
            const { orgId } = ctx.req.param() as { orgId: string };

            const adapter = getOrgAdapter(ctx.context, ctx.orgOptions);

            const permission = hasPermission({
                role: ctx.org.role,
                options: ctx.orgOptions,
                permissions: { 'org:domain': ["create"] }
            });

            if (!permission) {
                throw new APIError("FORBIDDEN");
            }

            const org = await adapter.findOrganizationById(orgId);

            if (!org.customDomain || !org.customDomainVerificationToken) {
                throw new APIError("BAD_REQUEST", { message: "No domain to verify" });
            }

            if (org.customDomainVerified) {
                throw new APIError("BAD_REQUEST", { message: "Domain is already verified" });
            }

            const verificationRecord = `_better-auth-verify.${org.customDomain}`;

            try {
                const { answers } = await query({ question: { name: verificationRecord, type: 'TXT' } });

                const txtRecord = answers.find(a => a.type === 'TXT');

                if (txtRecord && txtRecord.data.includes(org.customDomainVerificationToken)) {
                    await adapter.updateOrganization(orgId, { 
                        customDomainVerified: true,
                        customDomainVerificationToken: null,
                    });

                    return ctx.json({
                        success: true,
                    });
                } else {
                    throw new APIError("BAD_REQUEST", { message: "Verification failed. Please check your DNS settings." });
                }
            } catch (error) {
                throw new APIError("BAD_REQUEST", { message: "DNS query failed. Please try again later." });
            }
        }
    );

export const removeCustomDomain = <O extends OrganizationOptions>() =>
    createAuthEndpoint(
        "/organization/:orgId/domain",
        {
            method: "DELETE",
            use: [orgSessionMiddleware],
        },
        async (ctx) => {
            const { orgId } = ctx.req.param() as { orgId: string };

            const adapter = getOrgAdapter(ctx.context, ctx.orgOptions);

            const permission = hasPermission({
                role: ctx.org.role,
                options: ctx.orgOptions,
                permissions: { 'org:domain': ["delete"] }
            });

            if (!permission) {
                throw new APIError("FORBIDDEN");
            }

            await adapter.updateOrganization(orgId, { 
                customDomain: null,
                customDomainVerified: false,
                customDomainVerificationToken: null,
            });

            return ctx.json({
                success: true,
            });
        }
    );
