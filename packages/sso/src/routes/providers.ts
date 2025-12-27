import {
	APIError,
	createAuthEndpoint,
	sessionMiddleware,
} from "better-auth/api";
import z from "zod/v4";
import type { Member, OIDCConfig, SAMLConfig } from "../types";
import { maskClientId, parseCertificate, safeJsonParse } from "../utils";

const ADMIN_ROLES = ["owner", "admin"];

function isOrgPluginEnabled(ctx: {
	context: { options: { plugins?: { id: string }[] } };
}): boolean {
	return (
		ctx.context.options.plugins?.some((p) => p.id === "organization") ?? false
	);
}

async function isOrgAdmin(
	ctx: {
		context: {
			adapter: {
				findOne: <T>(query: {
					model: string;
					where: { field: string; value: string }[];
				}) => Promise<T | null>;
			};
		};
	},
	userId: string,
	organizationId: string,
): Promise<boolean> {
	const member = await ctx.context.adapter.findOne<Member>({
		model: "member",
		where: [
			{ field: "userId", value: userId },
			{ field: "organizationId", value: organizationId },
		],
	});
	if (!member) return false;
	const roles = member.role.split(",");
	return roles.some((r) => ADMIN_ROLES.includes(r.trim()));
}

function sanitizeProvider(
	provider: {
		providerId: string;
		issuer: string;
		domain: string;
		organizationId?: string | null;
		domainVerified?: boolean;
		oidcConfig?: string | OIDCConfig | null;
		samlConfig?: string | SAMLConfig | null;
	},
	baseURL: string,
) {
	const oidcConfig = safeJsonParse<OIDCConfig>(provider.oidcConfig as string);
	const samlConfig = safeJsonParse<SAMLConfig>(provider.samlConfig as string);

	const type = samlConfig ? "saml" : "oidc";

	return {
		providerId: provider.providerId,
		type,
		issuer: provider.issuer,
		domain: provider.domain,
		organizationId: provider.organizationId || null,
		domainVerified: provider.domainVerified,
		oidcConfig: oidcConfig
			? {
					discoveryEndpoint: oidcConfig.discoveryEndpoint,
					clientIdLastFour: maskClientId(oidcConfig.clientId),
					pkce: oidcConfig.pkce,
					authorizationEndpoint: oidcConfig.authorizationEndpoint,
					tokenEndpoint: oidcConfig.tokenEndpoint,
					userInfoEndpoint: oidcConfig.userInfoEndpoint,
					jwksEndpoint: oidcConfig.jwksEndpoint,
					scopes: oidcConfig.scopes,
					tokenEndpointAuthentication: oidcConfig.tokenEndpointAuthentication,
				}
			: undefined,
		samlConfig: samlConfig
			? {
					entryPoint: samlConfig.entryPoint,
					callbackUrl: samlConfig.callbackUrl,
					audience: samlConfig.audience,
					wantAssertionsSigned: samlConfig.wantAssertionsSigned,
					identifierFormat: samlConfig.identifierFormat,
					signatureAlgorithm: samlConfig.signatureAlgorithm,
					digestAlgorithm: samlConfig.digestAlgorithm,
					certificate: parseCertificate(samlConfig.cert),
				}
			: undefined,
		spMetadataUrl: `${baseURL}/sso/saml2/sp/metadata?providerId=${encodeURIComponent(provider.providerId)}`,
	};
}

export const listSSOProviders = () => {
	return createAuthEndpoint(
		"/sso/providers",
		{
			method: "GET",
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					operationId: "listSSOProviders",
					summary: "List SSO providers",
					description: "Returns a list of SSO providers the user has access to",
					responses: {
						"200": {
							description: "List of SSO providers",
						},
					},
				},
			},
		},
		async (ctx) => {
			const userId = ctx.context.session.user.id;

			const allProviders = await ctx.context.adapter.findMany<{
				id: string;
				providerId: string;
				issuer: string;
				domain: string;
				organizationId?: string | null;
				domainVerified?: boolean;
				userId: string;
				oidcConfig?: string | null;
				samlConfig?: string | null;
			}>({
				model: "ssoProvider",
			});

			const orgPluginEnabled = isOrgPluginEnabled(ctx);

			const accessibleProviders = await Promise.all(
				allProviders.map(async (provider) => {
					if (provider.organizationId) {
						if (orgPluginEnabled) {
							const hasAccess = await isOrgAdmin(
								ctx,
								userId,
								provider.organizationId,
							);
							return hasAccess ? provider : null;
						}
						return provider.userId === userId ? provider : null;
					}
					return provider.userId === userId ? provider : null;
				}),
			);

			const providers = accessibleProviders
				.filter((p): p is NonNullable<typeof p> => p !== null)
				.map((p) => sanitizeProvider(p, ctx.context.baseURL));

			return ctx.json({ providers });
		},
	);
};

const getSSOProviderParamsSchema = z.object({
	providerId: z.string(),
});

export const getSSOProvider = () => {
	return createAuthEndpoint(
		"/sso/providers/:providerId",
		{
			method: "GET",
			use: [sessionMiddleware],
			params: getSSOProviderParamsSchema,
			metadata: {
				openapi: {
					operationId: "getSSOProvider",
					summary: "Get SSO provider details",
					description: "Returns sanitized details for a specific SSO provider",
					responses: {
						"200": {
							description: "SSO provider details",
						},
						"404": {
							description: "Provider not found",
						},
						"403": {
							description: "Access denied",
						},
					},
				},
			},
		},
		async (ctx) => {
			const userId = ctx.context.session.user.id;
			const { providerId } = ctx.params;

			const provider = await ctx.context.adapter.findOne<{
				id: string;
				providerId: string;
				issuer: string;
				domain: string;
				organizationId?: string | null;
				domainVerified?: boolean;
				userId: string;
				oidcConfig?: string | null;
				samlConfig?: string | null;
			}>({
				model: "ssoProvider",
				where: [{ field: "providerId", value: providerId }],
			});

			if (!provider) {
				throw new APIError("NOT_FOUND", {
					message: "Provider not found",
				});
			}

			let hasAccess = false;
			if (provider.organizationId) {
				if (isOrgPluginEnabled(ctx)) {
					hasAccess = await isOrgAdmin(ctx, userId, provider.organizationId);
				} else {
					hasAccess = provider.userId === userId;
				}
			} else {
				hasAccess = provider.userId === userId;
			}

			if (!hasAccess) {
				throw new APIError("FORBIDDEN", {
					message: "You don't have access to this provider",
				});
			}

			return ctx.json(sanitizeProvider(provider, ctx.context.baseURL));
		},
	);
};
