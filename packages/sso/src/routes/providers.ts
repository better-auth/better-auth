import {
	APIError,
	createAuthEndpoint,
	sessionMiddleware,
} from "better-auth/api";
import type { AuthContext } from "@better-auth/core";
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

async function batchCheckOrgAdmin(
	ctx: { context: AuthContext },
	userId: string,
	organizationIds: string[],
): Promise<Set<string>> {
	if (organizationIds.length === 0) {
		return new Set();
	}

	const members = await ctx.context.adapter.findMany<Member>({
		model: "member",
		where: [
			{ field: "userId", value: userId },
			{ field: "organizationId", value: organizationIds, operator: "in" },
		],
	});

	const adminOrgIds = new Set<string>();
	for (const member of members) {
		const roles = member.role.split(",");
		if (roles.some((r) => ADMIN_ROLES.includes(r.trim()))) {
			adminOrgIds.add(member.organizationId);
		}
	}

	return adminOrgIds;
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
					certificate: (() => {
						try {
							return parseCertificate(samlConfig.cert);
						} catch {
							return { error: "Failed to parse certificate" };
						}
					})(),
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

function mergeSAMLConfig(
	current: SAMLConfig,
	updates: Partial<SAMLConfig>,
	issuer: string,
): SAMLConfig {
	return {
		...current,
		...updates,
		issuer,
		entryPoint: updates.entryPoint ?? current.entryPoint,
		cert: updates.cert ?? current.cert,
		callbackUrl: updates.callbackUrl ?? current.callbackUrl,
		spMetadata: updates.spMetadata ?? current.spMetadata,
		idpMetadata: updates.idpMetadata ?? current.idpMetadata,
		mapping: updates.mapping ?? current.mapping,
		audience: updates.audience ?? current.audience,
		wantAssertionsSigned:
			updates.wantAssertionsSigned ?? current.wantAssertionsSigned,
		identifierFormat: updates.identifierFormat ?? current.identifierFormat,
		signatureAlgorithm: updates.signatureAlgorithm ?? current.signatureAlgorithm,
		digestAlgorithm: updates.digestAlgorithm ?? current.digestAlgorithm,
	};
}

function mergeOIDCConfig(
	current: OIDCConfig,
	updates: Partial<OIDCConfig>,
	issuer: string,
): OIDCConfig {
	return {
		...current,
		...updates,
		issuer,
		pkce: updates.pkce ?? current.pkce ?? true,
		clientId: updates.clientId ?? current.clientId,
		clientSecret: updates.clientSecret ?? current.clientSecret,
		discoveryEndpoint: updates.discoveryEndpoint ?? current.discoveryEndpoint,
		mapping: updates.mapping ?? current.mapping,
		scopes: updates.scopes ?? current.scopes,
		authorizationEndpoint:
			updates.authorizationEndpoint ?? current.authorizationEndpoint,
		tokenEndpoint: updates.tokenEndpoint ?? current.tokenEndpoint,
		userInfoEndpoint: updates.userInfoEndpoint ?? current.userInfoEndpoint,
		jwksEndpoint: updates.jwksEndpoint ?? current.jwksEndpoint,
		tokenEndpointAuthentication:
			updates.tokenEndpointAuthentication ?? current.tokenEndpointAuthentication,
	};
}

export const updateSSOProvider = <O extends SSOOptions>(options: O) => {
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
					description:
						"Partially update an SSO provider. Only provided fields are updated. If domain changes, domainVerified is reset to false.",
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

			if (body.issuer !== undefined) {
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

			if (body.oidcConfig) {
				const currentOidcConfig = safeJsonParse<OIDCConfig>(
					provider.oidcConfig as string,
				);

				if (!currentOidcConfig) {
					throw new APIError("BAD_REQUEST", {
						message: "Cannot update OIDC config for a provider that doesn't have OIDC configured",
					});
				}

				const updatedOidcConfig = mergeOIDCConfig(
					currentOidcConfig,
					body.oidcConfig,
					updateData.issuer || currentOidcConfig.issuer || provider.issuer,
				);
				updateData.oidcConfig = JSON.stringify(updatedOidcConfig);
			}

			if (body.samlConfig) {
				const currentSamlConfig = safeJsonParse<SAMLConfig>(
					provider.samlConfig as string,
				);

				if (!currentSamlConfig) {
					throw new APIError("BAD_REQUEST", {
						message: "Cannot update SAML config for a provider that doesn't have SAML configured",
					});
				}

				if (
					body.samlConfig.signatureAlgorithm !== undefined ||
					body.samlConfig.digestAlgorithm !== undefined
				) {
					validateConfigAlgorithms(
						{
							signatureAlgorithm:
								body.samlConfig.signatureAlgorithm ??
								currentSamlConfig.signatureAlgorithm,
							digestAlgorithm:
								body.samlConfig.digestAlgorithm ??
								currentSamlConfig.digestAlgorithm,
						},
						options?.saml?.algorithms,
					);
				}

				const updatedSamlConfig = mergeSAMLConfig(
					currentSamlConfig,
					body.samlConfig,
					updateData.issuer || currentSamlConfig.issuer || provider.issuer,
				);
				updateData.samlConfig = JSON.stringify(updatedSamlConfig);
			}


			if (Object.keys(updateData).length === 0) {
				throw new APIError("BAD_REQUEST", {
					message: "No fields provided for update",
				});
			}

			await ctx.context.adapter.update({
				model: "ssoProvider",
				where: [{ field: "providerId", value: providerId }],
				update: updateData,
			});

			const fullProvider = await ctx.context.adapter.findOne<{
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

			if (!fullProvider) {
				throw new APIError("NOT_FOUND", {
					message: "Provider not found after update",
				});
			}

			return ctx.json(sanitizeProvider(fullProvider, ctx.context.baseURL));
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
