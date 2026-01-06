import {
	APIError,
	createAuthEndpoint,
	sessionMiddleware,
} from "better-auth/api";
import z from "zod/v4";
import { DEFAULT_MAX_SAML_METADATA_SIZE } from "../constants";
import { validateConfigAlgorithms } from "../saml";
import type { Member, OIDCConfig, SAMLConfig, SSOOptions } from "../types";
import { maskClientId, parseCertificate, safeJsonParse } from "../utils";
import { updateSSOProviderBodySchema } from "./schemas";

const ADMIN_ROLES = ["owner", "admin"];
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

			const orgPluginEnabled = ctx.context.hasPlugin("organization");

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
				if (ctx.context.hasPlugin("organization")) {
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

async function checkProviderAccess(
	ctx: {
		context: {
			session: { user: { id: string } };
			adapter: {
				findOne: <T>(query: {
					model: string;
					where: { field: string; value: string }[];
				}) => Promise<T | null>;
			};
			hasPlugin: (pluginId: string) => boolean;
		};
	},
	providerId: string,
): Promise<{
	id: string;
	providerId: string;
	issuer: string;
	domain: string;
	organizationId?: string | null;
	domainVerified?: boolean;
	userId: string;
	oidcConfig?: string | null;
	samlConfig?: string | null;
}> {
	const userId = ctx.context.session.user.id;

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
		if (ctx.context.hasPlugin("organization")) {
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

	return provider;
}

export const updateSSOProvider = <O extends SSOOptions>(options?: O) => {
	return createAuthEndpoint(
		"/sso/providers/:providerId",
		{
			method: "PATCH",
			use: [sessionMiddleware],
			params: getSSOProviderParamsSchema,
			body: updateSSOProviderBodySchema,
			metadata: {
				openapi: {
					operationId: "updateSSOProvider",
					summary: "Update SSO provider",
					description: "Updates an existing SSO provider configuration",
					responses: {
						"200": {
							description: "SSO provider updated successfully",
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
			const { providerId } = ctx.params;
			const body = ctx.body;

			const provider = await checkProviderAccess(ctx, providerId);

			if (body.issuer) {
				const issuerValidator = z.string().url();
				if (issuerValidator.safeParse(body.issuer).error) {
					throw new APIError("BAD_REQUEST", {
						message: "Invalid issuer. Must be a valid URL",
					});
				}
			}

			if (body.samlConfig?.idpMetadata?.metadata) {
				const maxMetadataSize =
					options?.saml?.maxMetadataSize ?? DEFAULT_MAX_SAML_METADATA_SIZE;
				if (
					new TextEncoder().encode(body.samlConfig.idpMetadata.metadata)
						.length > maxMetadataSize
				) {
					throw new APIError("BAD_REQUEST", {
						message: `IdP metadata exceeds maximum allowed size (${maxMetadataSize} bytes)`,
					});
				}
			}

			const existingOidcConfig = safeJsonParse<OIDCConfig>(
				provider.oidcConfig as string,
			);
			const existingSamlConfig = safeJsonParse<SAMLConfig>(
				provider.samlConfig as string,
			);

			if (body.oidcConfig && existingSamlConfig) {
				throw new APIError("BAD_REQUEST", {
					message: "Cannot update OIDC config for a SAML provider",
				});
			}

			if (body.samlConfig && existingOidcConfig) {
				throw new APIError("BAD_REQUEST", {
					message: "Cannot update SAML config for an OIDC provider",
				});
			}

			let updatedOidcConfig: string | null = provider.oidcConfig as string;
			let updatedSamlConfig: string | null = provider.samlConfig as string;

			if (body.oidcConfig && existingOidcConfig) {
				const mergedOidcConfig = {
					...existingOidcConfig,
					...body.oidcConfig,
					mapping: body.oidcConfig.mapping ?? existingOidcConfig.mapping,
				};
				updatedOidcConfig = JSON.stringify(mergedOidcConfig);
			}

			if (body.samlConfig) {
				if (existingSamlConfig) {
					validateConfigAlgorithms(
						{
							signatureAlgorithm:
								body.samlConfig.signatureAlgorithm ??
								existingSamlConfig.signatureAlgorithm,
							digestAlgorithm:
								body.samlConfig.digestAlgorithm ??
								existingSamlConfig.digestAlgorithm,
						},
						options?.saml?.algorithms,
					);

					const mergedSamlConfig = {
						...existingSamlConfig,
						...body.samlConfig,
						idpMetadata: body.samlConfig.idpMetadata ?? existingSamlConfig.idpMetadata,
						spMetadata: body.samlConfig.spMetadata ?? existingSamlConfig.spMetadata,
						mapping: body.samlConfig.mapping ?? existingSamlConfig.mapping,
					};
					updatedSamlConfig = JSON.stringify(mergedSamlConfig);
				} else {
					validateConfigAlgorithms(
						{
							signatureAlgorithm: body.samlConfig.signatureAlgorithm,
							digestAlgorithm: body.samlConfig.digestAlgorithm,
						},
						options?.saml?.algorithms,
					);

					updatedSamlConfig = JSON.stringify({
						issuer: body.issuer ?? provider.issuer,
						...body.samlConfig,
					});
				}
			} else if (existingSamlConfig) {
				validateConfigAlgorithms(
					{
						signatureAlgorithm: existingSamlConfig.signatureAlgorithm,
						digestAlgorithm: existingSamlConfig.digestAlgorithm,
					},
					options?.saml?.algorithms,
				);
			}

			const updateData: {
				issuer?: string;
				domain?: string;
				oidcConfig?: string | null;
				samlConfig?: string | null;
				domainVerified?: boolean;
			} = {};

			if (body.issuer !== undefined) {
				updateData.issuer = body.issuer;
			}

			if (body.domain !== undefined) {
				updateData.domain = body.domain;
				if (body.domain !== provider.domain) {
					updateData.domainVerified = false;
				}
			}

			if (updatedOidcConfig !== null) {
				updateData.oidcConfig = updatedOidcConfig;
			}

			if (updatedSamlConfig !== null) {
				updateData.samlConfig = updatedSamlConfig;
			}

			const updatedProvider = await ctx.context.adapter.update<{
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
				update: updateData,
			});

			if (!updatedProvider) {
				throw new APIError("NOT_FOUND", {
					message: "Provider not found",
				});
			}

			return ctx.json(sanitizeProvider(updatedProvider, ctx.context.baseURL));
		},
	);
};

export const deleteSSOProvider = () => {
	return createAuthEndpoint(
		"/sso/providers/:providerId",
		{
			method: "DELETE",
			use: [sessionMiddleware],
			params: getSSOProviderParamsSchema,
			metadata: {
				openapi: {
					operationId: "deleteSSOProvider",
					summary: "Delete SSO provider",
					description: "Deletes an SSO provider",
					responses: {
						"200": {
							description: "SSO provider deleted successfully",
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
			const { providerId } = ctx.params;

			await checkProviderAccess(ctx, providerId);

			await ctx.context.adapter.delete({
				model: "ssoProvider",
				where: [{ field: "providerId", value: providerId }],
			});

			return ctx.json({ success: true });
		},
	);
};
