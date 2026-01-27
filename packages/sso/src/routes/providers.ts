import type { AuthContext } from "better-auth";
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

interface SSOProviderRecord {
	id: string;
	providerId: string;
	issuer: string;
	domain: string;
	organizationId?: string | null;
	domainVerified?: boolean;
	userId: string;
	oidcConfig?: string | null;
	samlConfig?: string | null;
}

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
	ctx: {
		context: AuthContext;
	},
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
		if (roles.some((r: string) => ADMIN_ROLES.includes(r.trim()))) {
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
	let oidcConfig: OIDCConfig | null = null;
	let samlConfig: SAMLConfig | null = null;

	try {
		oidcConfig = safeJsonParse<OIDCConfig>(provider.oidcConfig as string);
	} catch {
		oidcConfig = null;
	}

	try {
		samlConfig = safeJsonParse<SAMLConfig>(provider.samlConfig as string);
	} catch {
		samlConfig = null;
	}

	const type = samlConfig ? "saml" : "oidc";

	return {
		providerId: provider.providerId,
		type,
		issuer: provider.issuer,
		domain: provider.domain,
		organizationId: provider.organizationId || null,
		domainVerified: provider.domainVerified ?? false,
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
					authnRequestsSigned: samlConfig.authnRequestsSigned,
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

			const allProviders =
				await ctx.context.adapter.findMany<SSOProviderRecord>({
					model: "ssoProvider",
				});

			const userOwnedProviders = allProviders.filter(
				(p) => p.userId === userId && !p.organizationId,
			);

			const orgProviders = allProviders.filter(
				(p) => p.organizationId !== null && p.organizationId !== undefined,
			);

			const orgPluginEnabled = ctx.context.hasPlugin("organization");

			let accessibleProviders: typeof userOwnedProviders = [
				...userOwnedProviders,
			];

			if (orgPluginEnabled && orgProviders.length > 0) {
				const orgIds = [
					...new Set(
						orgProviders
							.map((p) => p.organizationId)
							.filter((id): id is string => id !== null && id !== undefined),
					),
				];

				const adminOrgIds = await batchCheckOrgAdmin(ctx, userId, orgIds);

				const orgAccessibleProviders = orgProviders.filter(
					(provider) =>
						provider.organizationId && adminOrgIds.has(provider.organizationId),
				);

				accessibleProviders = [
					...accessibleProviders,
					...orgAccessibleProviders,
				];
			} else if (!orgPluginEnabled) {
				const userOwnedOrgProviders = orgProviders.filter(
					(p) => p.userId === userId,
				);
				accessibleProviders = [
					...accessibleProviders,
					...userOwnedOrgProviders,
				];
			}

			const providers = accessibleProviders.map((p) =>
				sanitizeProvider(p, ctx.context.baseURL),
			);

			return ctx.json({ providers });
		},
	);
};

const getSSOProviderParamsSchema = z.object({
	providerId: z.string(),
});

async function checkProviderAccess(
	ctx: {
		context: AuthContext & {
			session: { user: { id: string } };
		};
	},
	providerId: string,
) {
	const userId = ctx.context.session.user.id;

	const provider = await ctx.context.adapter.findOne<SSOProviderRecord>({
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
			const { providerId } = ctx.params;

			const provider = await checkProviderAccess(ctx, providerId);

			return ctx.json(sanitizeProvider(provider, ctx.context.baseURL));
		},
	);
};

function parseAndValidateConfig<T>(
	configString: string | null | undefined,
	configType: "SAML" | "OIDC",
): T {
	let config: T | null = null;
	try {
		config = safeJsonParse<T>(configString as string);
	} catch {
		config = null;
	}
	if (!config) {
		throw new APIError("BAD_REQUEST", {
			message: `Cannot update ${configType} config for a provider that doesn't have ${configType} configured`,
		});
	}
	return config;
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
		authnRequestsSigned:
			updates.authnRequestsSigned ?? current.authnRequestsSigned,
		identifierFormat: updates.identifierFormat ?? current.identifierFormat,
		signatureAlgorithm:
			updates.signatureAlgorithm ?? current.signatureAlgorithm,
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
			updates.tokenEndpointAuthentication ??
			current.tokenEndpointAuthentication,
	};
}

export const updateSSOProvider = (options: SSOOptions) => {
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

			const { issuer, domain, samlConfig, oidcConfig } = body;
			if (!issuer && !domain && !samlConfig && !oidcConfig) {
				throw new APIError("BAD_REQUEST", {
					message: "No fields provided for update",
				});
			}

			const existingProvider = await checkProviderAccess(ctx, providerId);

			const updateData: Partial<SSOProviderRecord> = {};

			if (body.issuer !== undefined) {
				updateData.issuer = body.issuer;
			}

			if (body.domain !== undefined) {
				updateData.domain = body.domain;
				if (body.domain !== existingProvider.domain) {
					updateData.domainVerified = false;
				}
			}

			if (body.samlConfig) {
				if (body.samlConfig.idpMetadata?.metadata) {
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

				if (
					body.samlConfig.signatureAlgorithm !== undefined ||
					body.samlConfig.digestAlgorithm !== undefined
				) {
					validateConfigAlgorithms(
						{
							signatureAlgorithm: body.samlConfig.signatureAlgorithm,
							digestAlgorithm: body.samlConfig.digestAlgorithm,
						},
						options?.saml?.algorithms,
					);
				}

				const currentSamlConfig = parseAndValidateConfig<SAMLConfig>(
					existingProvider.samlConfig,
					"SAML",
				);

				const updatedSamlConfig = mergeSAMLConfig(
					currentSamlConfig,
					body.samlConfig,
					updateData.issuer ||
						currentSamlConfig.issuer ||
						existingProvider.issuer,
				);

				updateData.samlConfig = JSON.stringify(updatedSamlConfig);
			}

			if (body.oidcConfig) {
				const currentOidcConfig = parseAndValidateConfig<OIDCConfig>(
					existingProvider.oidcConfig,
					"OIDC",
				);

				const updatedOidcConfig = mergeOIDCConfig(
					currentOidcConfig,
					body.oidcConfig,
					updateData.issuer ||
						currentOidcConfig.issuer ||
						existingProvider.issuer,
				);

				updateData.oidcConfig = JSON.stringify(updatedOidcConfig);
			}

			await ctx.context.adapter.update({
				model: "ssoProvider",
				where: [{ field: "providerId", value: providerId }],
				update: updateData,
			});

			const fullProvider = await ctx.context.adapter.findOne<SSOProviderRecord>(
				{
					model: "ssoProvider",
					where: [{ field: "providerId", value: providerId }],
				},
			);

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
