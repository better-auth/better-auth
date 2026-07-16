import {
	getCurrentAdapter,
	runWithTransaction,
} from "@better-auth/core/context";
import type { DBFieldAttribute } from "@better-auth/core/db";
import { filterOutputFields } from "@better-auth/core/utils/db";
import type { AuthContext } from "better-auth";
import {
	APIError,
	createAuthEndpoint,
	sessionMiddleware,
} from "better-auth/api";
import * as z from "zod";
import { DEFAULT_MAX_SAML_METADATA_SIZE } from "../constants";
import {
	DiscoveryError,
	mapDiscoveryErrorToAPIError,
	validateOIDCEndpointUrls,
} from "../oidc";
import {
	resolveSigningCerts,
	validateCertSources,
	validateConfigAlgorithms,
} from "../saml";
import type {
	Member,
	OIDCConfig,
	SAMLConfig,
	SAMLIdentityProviderMetadata,
	SSOOptions,
} from "../types";
import { maskClientId, parseCertificate, safeJsonParse } from "../utils";
import { assertSAMLIdentityProviderAuthority } from "./helpers";
import {
	getUpdateSSOProviderBodySchema,
	parseSSOProviderAdditionalFields,
} from "./schemas";

interface SSOProviderRecord {
	[key: string]: unknown;
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

type ProviderIdentitySnapshot = {
	providerId: string;
	issuer: string;
	userId?: string | undefined;
	oidcConfig?: OIDCConfig | string | null | undefined;
	samlConfig?: SAMLConfig | string | null | undefined;
};

const ADMIN_ROLES = ["owner", "admin"];
const OIDC_IDENTITY_BOUNDARY_FIELDS = [
	"authorizationEndpoint",
	"clientId",
	"discoveryEndpoint",
	"jwksEndpoint",
	"tokenEndpoint",
	"userInfoEndpoint",
] as const;
const SAML_IDENTITY_BOUNDARY_FIELDS = [
	"audience",
	"callbackUrl",
	"entryPoint",
	"identifierFormat",
] as const;
const SAML_IDP_BOUNDARY_FIELDS = [
	"metadata",
	"entityID",
	"singleSignOnService",
] as const;
const SAML_SP_BOUNDARY_FIELDS = ["metadata", "entityID"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`;
	}

	if (isRecord(value)) {
		return `{${Object.keys(value)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
			.join(",")}}`;
	}

	return JSON.stringify(value) ?? String(value);
}

function identityValueChanged(current: unknown, updated: unknown): boolean {
	return stableStringify(current) !== stableStringify(updated);
}

function hasChangedField<T extends object>(
	current: T | null | undefined,
	updated: T | null | undefined,
	fields: readonly (keyof T)[],
): boolean {
	return fields.some((field) =>
		identityValueChanged(current?.[field], updated?.[field]),
	);
}

function oidcIdentityBoundaryChanged(
	current: OIDCConfig,
	updated: OIDCConfig,
): boolean {
	return hasChangedField(current, updated, OIDC_IDENTITY_BOUNDARY_FIELDS);
}

function samlIdentityBoundaryChanged(
	current: SAMLConfig,
	updated: SAMLConfig,
): boolean {
	return (
		hasChangedField(current, updated, SAML_IDENTITY_BOUNDARY_FIELDS) ||
		hasChangedField(
			current.idpMetadata,
			updated.idpMetadata,
			SAML_IDP_BOUNDARY_FIELDS,
		) ||
		hasChangedField(
			current.spMetadata,
			updated.spMetadata,
			SAML_SP_BOUNDARY_FIELDS,
		)
	);
}

function parseConfigSnapshot<T>(
	config: T | string | null | undefined,
	configType: "SAML" | "OIDC",
): T | undefined {
	if (!config) {
		return undefined;
	}
	if (typeof config === "string") {
		return parseAndValidateConfig<T>(config, configType);
	}
	return config;
}

function ssoProviderIdentityBoundaryChanged(
	current: ProviderIdentitySnapshot,
	updated: ProviderIdentitySnapshot,
): boolean {
	if (identityValueChanged(current.issuer, updated.issuer)) {
		return true;
	}

	const currentSamlConfig = parseConfigSnapshot<SAMLConfig>(
		current.samlConfig,
		"SAML",
	);
	const updatedSamlConfig = parseConfigSnapshot<SAMLConfig>(
		updated.samlConfig,
		"SAML",
	);
	if (
		currentSamlConfig &&
		(!updatedSamlConfig ||
			samlIdentityBoundaryChanged(currentSamlConfig, updatedSamlConfig))
	) {
		return true;
	}

	const currentOidcConfig = parseConfigSnapshot<OIDCConfig>(
		current.oidcConfig,
		"OIDC",
	);
	const updatedOidcConfig = parseConfigSnapshot<OIDCConfig>(
		updated.oidcConfig,
		"OIDC",
	);
	return Boolean(
		currentOidcConfig &&
			(!updatedOidcConfig ||
				oidcIdentityBoundaryChanged(currentOidcConfig, updatedOidcConfig)),
	);
}

async function lockSSOProviderRow(
	adapter: AuthContext["adapter"],
	providerId: string,
): Promise<SSOProviderRecord | null> {
	const trx = await getCurrentAdapter(adapter);
	return trx.update<SSOProviderRecord>({
		model: "ssoProvider",
		where: [{ field: "providerId", value: providerId }],
		update: { providerId },
	});
}

export async function lockSSOProviderForAccountLink(
	ctx: { context: AuthContext },
	provider: ProviderIdentitySnapshot,
) {
	const lockedProvider = await lockSSOProviderRow(
		ctx.context.adapter,
		provider.providerId,
	);
	if (!lockedProvider) {
		if (provider.userId === "default") {
			return;
		}
		throw new APIError("CONFLICT", {
			code: "SSO_PROVIDER_CHANGED",
			message: "SSO provider changed while account linking was in progress",
		});
	}

	if (ssoProviderIdentityBoundaryChanged(provider, lockedProvider)) {
		throw new APIError("CONFLICT", {
			code: "SSO_PROVIDER_CHANGED",
			message: "SSO provider changed while account linking was in progress",
		});
	}
}

function getSSOProviderAdditionalFields(options?: SSOOptions) {
	return (options?.schema?.ssoProvider?.additionalFields ?? {}) as Record<
		string,
		DBFieldAttribute
	>;
}

export function filterSSOProviderAdditionalFields<
	T extends Record<string, unknown>,
>(provider: T, options?: SSOOptions) {
	return filterOutputFields(provider, getSSOProviderAdditionalFields(options));
}

function getReturnedSSOProviderAdditionalFields(
	provider: Record<string, unknown>,
	options?: SSOOptions,
) {
	const additionalFields = getSSOProviderAdditionalFields(options);
	const result: Record<string, unknown> = {};
	for (const key in additionalFields) {
		if (additionalFields[key]?.returned === false) {
			continue;
		}
		if (key in provider) {
			result[key] = provider[key];
		}
	}
	return result;
}

export function hasOrgAdminRole(member: Pick<Member, "role">): boolean {
	return member.role.split(",").some((r) => ADMIN_ROLES.includes(r.trim()));
}

type ParsedCert = ReturnType<typeof parseCertificate>;
type SanitizedCert = ParsedCert | { error: string };

function parseCertOrError(cert: string): SanitizedCert {
	try {
		return parseCertificate(cert);
	} catch {
		return { error: "Failed to parse certificate" };
	}
}

function sanitizeSigningCerts(config: SAMLConfig): SanitizedCert[] | undefined {
	const certs = resolveSigningCerts(config);
	if (certs === undefined) return undefined;
	return certs.map(parseCertOrError);
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
	return member ? hasOrgAdminRole(member) : false;
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
		if (hasOrgAdminRole(member)) {
			adminOrgIds.add(member.organizationId);
		}
	}

	return adminOrgIds;
}

function sanitizeProvider(
	provider: {
		[key: string]: unknown;
		providerId: string;
		issuer: string;
		domain: string;
		organizationId?: string | null;
		domainVerified?: boolean;
		oidcConfig?: string | OIDCConfig | null;
		samlConfig?: string | SAMLConfig | null;
	},
	baseURL: string,
	options?: SSOOptions,
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
	const returnedAdditionalFields = getReturnedSSOProviderAdditionalFields(
		provider,
		options,
	);

	return {
		...returnedAdditionalFields,
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
					audience: samlConfig.audience,
					wantAssertionsSigned: samlConfig.wantAssertionsSigned,
					authnRequestsSigned: samlConfig.authnRequestsSigned,
					identifierFormat: samlConfig.identifierFormat,
					signatureAlgorithm: samlConfig.signatureAlgorithm,
					digestAlgorithm: samlConfig.digestAlgorithm,
					certificate: sanitizeSigningCerts(samlConfig),
				}
			: undefined,
		spMetadataUrl: `${baseURL}/sso/saml2/sp/metadata?providerId=${encodeURIComponent(provider.providerId)}`,
	};
}

export const listSSOProviders = (options?: SSOOptions) => {
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
							description:
								"List of SSO providers. The `certificate` field is an array of parsed certificates for SAML providers, or absent when certs live inside `idpMetadata.metadata`.",
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
				sanitizeProvider(p, ctx.context.baseURL, options),
			);

			return ctx.json({ providers });
		},
	);
};

const getSSOProviderQuerySchema = z.object({
	providerId: z.string(),
});

export async function checkProviderAccess(
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

export const getSSOProvider = (options?: SSOOptions) => {
	return createAuthEndpoint(
		"/sso/get-provider",
		{
			method: "GET",
			use: [sessionMiddleware],
			query: getSSOProviderQuerySchema,
			metadata: {
				openapi: {
					operationId: "getSSOProvider",
					summary: "Get SSO provider details",
					description: "Returns sanitized details for a specific SSO provider",
					responses: {
						"200": {
							description:
								"SSO provider details. The `certificate` field is an array of parsed certificates for SAML providers, or absent when certs live inside `idpMetadata.metadata`.",
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
			const { providerId } = ctx.query;

			const provider = await checkProviderAccess(ctx, providerId);

			return ctx.json(sanitizeProvider(provider, ctx.context.baseURL, options));
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

type SAMLConfigUpdate = Omit<
	Partial<SAMLConfig>,
	"idpMetadata" | "spMetadata"
> & {
	idpMetadata?: Partial<SAMLIdentityProviderMetadata> | undefined;
	spMetadata?: Partial<NonNullable<SAMLConfig["spMetadata"]>> | undefined;
};

function mergeSAMLIdentityProviderMetadata(
	current: SAMLIdentityProviderMetadata,
	updates: Partial<SAMLIdentityProviderMetadata> | undefined,
): SAMLIdentityProviderMetadata {
	if (!updates) {
		return current;
	}

	const config = { idpMetadata: { ...current, ...updates } };
	assertSAMLIdentityProviderAuthority(config);
	return config.idpMetadata;
}

function mergeSAMLConfig(
	current: SAMLConfig,
	updates: SAMLConfigUpdate,
	issuer: string,
): SAMLConfig {
	return {
		...current,
		...updates,
		issuer,
		entryPoint: updates.entryPoint ?? current.entryPoint,
		cert: updates.cert ?? current.cert,
		spMetadata: updates.spMetadata
			? { ...current.spMetadata, ...updates.spMetadata }
			: current.spMetadata,
		idpMetadata: mergeSAMLIdentityProviderMetadata(
			current.idpMetadata,
			updates.idpMetadata,
		),
		mapping: updates.mapping ?? current.mapping,
		audience: updates.audience ?? current.audience,
		callbackUrl: updates.callbackUrl ?? current.callbackUrl,
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
		privateKeyId: updates.privateKeyId ?? current.privateKeyId,
		privateKeyAlgorithm:
			updates.privateKeyAlgorithm ?? current.privateKeyAlgorithm,
	};
}

export const updateSSOProvider = (options: SSOOptions) => {
	const updateBodySchema = getUpdateSSOProviderBodySchema(options);

	return createAuthEndpoint(
		"/sso/update-provider",
		{
			method: "POST",
			use: [sessionMiddleware],
			body: updateBodySchema,
			metadata: {
				openapi: {
					operationId: "updateSSOProvider",
					summary: "Update SSO provider",
					description:
						"Partially update an SSO provider. Only provided fields are updated. If domain changes, domainVerified is reset to false.",
					responses: {
						"200": {
							description:
								"SSO provider updated successfully. The `certificate` field is an array of parsed certificates for SAML providers, or absent when certs live inside `idpMetadata.metadata`.",
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
			const { providerId, ...body } = ctx.body;

			const { issuer, domain, samlConfig, oidcConfig } = body;
			const additionalFields = parseSSOProviderAdditionalFields(
				options,
				body,
				"update",
			);
			if (
				!issuer &&
				!domain &&
				!samlConfig &&
				!oidcConfig &&
				Object.keys(additionalFields).length === 0
			) {
				throw new APIError("BAD_REQUEST", {
					message: "No fields provided for update",
				});
			}

			await checkProviderAccess(ctx, providerId);

			const fullProvider = await runWithTransaction(
				ctx.context.adapter,
				async () => {
					const trx = await getCurrentAdapter(ctx.context.adapter);
					const existingProvider = await lockSSOProviderRow(
						ctx.context.adapter,
						providerId,
					);
					if (!existingProvider) {
						throw new APIError("NOT_FOUND", {
							message: "Provider not found",
						});
					}

					const updateData: Partial<SSOProviderRecord> = {
						...additionalFields,
					};
					let providerIdentityBoundaryChanged =
						body.issuer !== undefined &&
						body.issuer !== existingProvider.issuer;

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
								options?.saml?.maxMetadataSize ??
								DEFAULT_MAX_SAML_METADATA_SIZE;
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

						validateCertSources(updatedSamlConfig);
						assertSAMLIdentityProviderAuthority(updatedSamlConfig);
						if (
							samlIdentityBoundaryChanged(currentSamlConfig, updatedSamlConfig)
						) {
							providerIdentityBoundaryChanged = true;
						}

						updateData.samlConfig = JSON.stringify(updatedSamlConfig);
					}

					if (body.oidcConfig) {
						try {
							validateOIDCEndpointUrls(body.oidcConfig, (url) =>
								ctx.context.isTrustedOrigin(url),
							);
						} catch (error) {
							if (error instanceof DiscoveryError) {
								throw mapDiscoveryErrorToAPIError(error);
							}
							throw error;
						}

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

						// Validate: clientSecret is required for non-private_key_jwt auth
						if (
							updatedOidcConfig.tokenEndpointAuthentication !==
								"private_key_jwt" &&
							!updatedOidcConfig.clientSecret
						) {
							throw new APIError("BAD_REQUEST", {
								message:
									"clientSecret is required when using client_secret_basic or client_secret_post authentication",
							});
						}
						// Validate: private_key_jwt requires a key source at runtime
						if (
							updatedOidcConfig.tokenEndpointAuthentication ===
								"private_key_jwt" &&
							!options?.resolvePrivateKey &&
							!options?.defaultSSO?.some(
								(p: Record<string, unknown>) =>
									p.providerId === providerId &&
									"privateKey" in p &&
									p.privateKey,
							)
						) {
							throw new APIError("BAD_REQUEST", {
								message:
									"private_key_jwt authentication requires either a resolvePrivateKey callback or a privateKey in defaultSSO",
							});
						}

						if (
							oidcIdentityBoundaryChanged(currentOidcConfig, updatedOidcConfig)
						) {
							providerIdentityBoundaryChanged = true;
						}

						updateData.oidcConfig = JSON.stringify(updatedOidcConfig);
					}

					if (providerIdentityBoundaryChanged) {
						const linkedAccount = await trx.findOne<{ id: string }>({
							model: "account",
							where: [{ field: "providerId", value: providerId }],
						});
						if (linkedAccount) {
							// TODO(next): move SSO account links to immutable provider instance
							// ids, then expose explicit relinking for identity-boundary changes.
							throw new APIError("CONFLICT", {
								message:
									"Cannot change SSO provider identity fields while linked accounts exist",
							});
						}
					}

					await trx.update({
						model: "ssoProvider",
						where: [{ field: "providerId", value: providerId }],
						update: updateData,
					});

					const updatedProvider = await trx.findOne<SSOProviderRecord>({
						model: "ssoProvider",
						where: [{ field: "providerId", value: providerId }],
					});

					if (!updatedProvider) {
						throw new APIError("NOT_FOUND", {
							message: "Provider not found after update",
						});
					}

					return updatedProvider;
				},
			);

			return ctx.json(
				sanitizeProvider(fullProvider, ctx.context.baseURL, options),
			);
		},
	);
};

export const deleteSSOProvider = () => {
	return createAuthEndpoint(
		"/sso/delete-provider",
		{
			method: "POST",
			use: [sessionMiddleware],
			body: z.object({
				providerId: z.string(),
			}),
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
			const { providerId } = ctx.body;

			await checkProviderAccess(ctx, providerId);

			await runWithTransaction(ctx.context.adapter, async () => {
				const trx = await getCurrentAdapter(ctx.context.adapter);
				await trx.deleteMany({
					model: "account",
					where: [{ field: "providerId", value: providerId }],
				});
				await trx.delete({
					model: "ssoProvider",
					where: [{ field: "providerId", value: providerId }],
				});
			});

			return ctx.json({ success: true });
		},
	);
};
