import {
	getCurrentAdapter,
	runWithTransaction,
} from "@better-auth/core/context";
import type { DBFieldAttribute } from "@better-auth/core/db";
import { filterOutputFields } from "@better-auth/core/utils/db";
import type { AuthContext, Where } from "better-auth";
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
import { computeSSOProviderReference } from "../provider-reference";
import {
	getSAMLPostAssertionConsumerServiceUrls,
	resolveSigningCerts,
	validateCertSources,
	validateConfigAlgorithms,
} from "../saml";
import { parseSAMLServiceProviderMetadata } from "../saml/response-binding";
import type {
	Member,
	OIDCConfig,
	SAMLConfig,
	SAMLIdentityProviderMetadata,
	SSOOptions,
} from "../types";
import { assertSSOAsyncContextSupport } from "../user-resolution";
import {
	maskClientId,
	normalizePem,
	parseCertificate,
	safeJsonParse,
} from "../utils";
import {
	assertSAMLIdentityProviderAuthority,
	assertSAMLMetadataSize,
	assertSAMLServiceProviderMetadataPolicy,
	createIdP,
} from "./helpers";
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
	id?: string | undefined;
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
const SAML_IDENTITY_BOUNDARY_FIELDS = ["audience"] as const;

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

/**
 * Signing certificates are reported apart from the identity boundary: they
 * change who can sign assertions, so the mutation guard treats them as an
 * authentication-boundary change, but they do not change which IdP identities
 * linked accounts belong to.
 */
function samlBoundaryChanges(
	current: SAMLConfig,
	updated: SAMLConfig,
): { identity: boolean; trustAnchors: boolean } {
	const currentIdentityProvider = createIdP(current).entityMeta;
	const updatedIdentityProvider = createIdP(updated).entityMeta;
	let currentServiceProvider: ReturnType<
		typeof parseSAMLServiceProviderMetadata
	> | null;
	let updatedServiceProvider: ReturnType<
		typeof parseSAMLServiceProviderMetadata
	> | null;
	try {
		currentServiceProvider = current.spMetadata?.metadata
			? parseSAMLServiceProviderMetadata(current.spMetadata.metadata)
			: null;
		updatedServiceProvider = updated.spMetadata?.metadata
			? parseSAMLServiceProviderMetadata(updated.spMetadata.metadata)
			: null;
	} catch {
		return { identity: true, trustAnchors: true };
	}
	const effectiveIdentityBoundary = (config: SAMLConfig) => {
		const identityProvider =
			config === current ? currentIdentityProvider : updatedIdentityProvider;
		const serviceProvider =
			config === current ? currentServiceProvider : updatedServiceProvider;
		return {
			idpEntityId: identityProvider.getEntityID(),
			idpRedirectService: identityProvider.getSingleSignOnService("redirect"),
			idpPostService: identityProvider.getSingleSignOnService("post"),
			spEntityId:
				serviceProvider?.entityID ??
				config.spMetadata?.entityID ??
				config.issuer,
			spNameIDFormat:
				serviceProvider?.nameIDFormats.at(0) ?? config.identifierFormat,
			// Without SP metadata, the ACS is always the providerId-derived route.
			spPostServices: serviceProvider
				? getSAMLPostAssertionConsumerServiceUrls(config.spMetadata?.metadata)
				: [],
			wantAssertionsSigned:
				serviceProvider?.wantAssertionsSigned ??
				config.wantAssertionsSigned === true,
		};
	};
	const trustAnchors = (
		identityProvider: ReturnType<typeof createIdP>["entityMeta"],
	) => {
		const certificates = identityProvider.getX509Certificate("signing");
		return (
			Array.isArray(certificates)
				? certificates
				: certificates
					? [certificates]
					: []
		)
			.map((certificate) => normalizePem(certificate) ?? certificate)
			.sort();
	};
	return {
		identity:
			hasChangedField(current, updated, SAML_IDENTITY_BOUNDARY_FIELDS) ||
			identityValueChanged(
				effectiveIdentityBoundary(current),
				effectiveIdentityBoundary(updated),
			),
		trustAnchors: identityValueChanged(
			trustAnchors(currentIdentityProvider),
			trustAnchors(updatedIdentityProvider),
		),
	};
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

function ssoProviderAuthBoundaryChanged(
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
	if (currentSamlConfig) {
		if (!updatedSamlConfig) {
			return true;
		}
		// An unchanged config skips the metadata parses on every sign-in.
		if (identityValueChanged(currentSamlConfig, updatedSamlConfig)) {
			const changes = samlBoundaryChanges(currentSamlConfig, updatedSamlConfig);
			if (changes.identity || changes.trustAnchors) {
				return true;
			}
		}
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
	context: AuthContext,
	provider: Pick<SSOProviderRecord, "providerId"> &
		Partial<Pick<SSOProviderRecord, "id">>,
): Promise<SSOProviderRecord | null> {
	const where = [
		...(provider.id ? [{ field: "id", value: provider.id }] : []),
		{ field: "providerId", value: provider.providerId },
	];
	const trx = await getCurrentAdapter(context.adapter);
	return trx.update<SSOProviderRecord>({
		model: "ssoProvider",
		where,
		update: { providerId: provider.providerId },
	});
}

async function guardSSOProviderMutation(
	options: SSOOptions | undefined,
	mutation:
		| { action: "update"; isAuthenticationBoundaryChange: boolean }
		| { action: "delete" },
	provider: SSOProviderRecord,
	database: Awaited<ReturnType<typeof getCurrentAdapter>>,
	logger: AuthContext["logger"],
): Promise<void> {
	if (!options?.guardProviderMutation) return;
	const oidcConfig = provider.oidcConfig
		? parseConfigSnapshot<OIDCConfig>(provider.oidcConfig, "OIDC")
		: undefined;
	const samlConfig = provider.samlConfig
		? parseConfigSnapshot<SAMLConfig>(provider.samlConfig, "SAML")
		: undefined;
	const providerReference = await computeSSOProviderReference({
		...provider,
		organizationId: provider.organizationId ?? undefined,
		oidcConfig,
		samlConfig,
	});
	try {
		await options.guardProviderMutation(
			{
				...mutation,
				provider: {
					id: provider.id,
					providerId: provider.providerId,
					organizationId: provider.organizationId ?? null,
				},
				providerReference,
			},
			{ database },
		);
	} catch {
		try {
			logger.error("SSO provider mutation guard rejected the mutation");
		} catch {
			// A custom logger must not change the stable conflict response.
		}
		throw new APIError("CONFLICT", {
			code: "SSO_PROVIDER_MUTATION_REJECTED",
			message: "SSO provider mutation is not allowed",
		});
	}
}

type ProviderMutationMode = "transactional" | "optimistic";

/**
 * Picks how a guarded provider mutation is applied. Adapters with a native
 * transaction callback run the guard and the write in one transaction.
 * Adapters without one, such as Drizzle on Cloudflare D1, use optimistic
 * concurrency: the guard approves a provider row snapshot and the write is a
 * compare-and-swap against that snapshot.
 */
async function resolveProviderMutationMode(
	options: SSOOptions | undefined,
	adapter: AuthContext["adapter"],
): Promise<ProviderMutationMode> {
	if (!options?.guardProviderMutation) return "transactional";
	if (typeof adapter.options?.adapterConfig.transaction !== "function") {
		return "optimistic";
	}
	await assertSSOAsyncContextSupport({
		code: "SSO_PROVIDER_MUTATION_GUARD_REQUIRES_ASYNC_CONTEXT",
		message:
			"SSO provider mutation guards require database transaction async context support",
	});
	return "transactional";
}

const PROVIDER_MUTATION_SNAPSHOT_FIELDS = [
	"id",
	"issuer",
	"oidcConfig",
	"samlConfig",
	"userId",
	"providerId",
	"organizationId",
	"domain",
	"domainVerified",
] as const;

function isSnapshotScalar(
	value: unknown,
): value is string | number | boolean | Date | null {
	return (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean" ||
		value instanceof Date
	);
}

/**
 * Predicates that fence an optimistic provider mutation against concurrent
 * changes to the exact row the guard evaluated. Only scalar columns can be
 * expressed as equality predicates; `oidcConfig` and `samlConfig` are stored
 * as strings, so they participate in the fence. The adapters Better Auth ships
 * evaluate the predicate and the write atomically and report a zero-row write
 * as `null`, which makes the guarded write a compare-and-swap.
 */
function getProviderMutationSnapshotWhere(
	provider: SSOProviderRecord,
): Where[] {
	const fields = new Set<string>(PROVIDER_MUTATION_SNAPSHOT_FIELDS);
	for (const field of Object.keys(provider)) {
		if (isSnapshotScalar(provider[field])) fields.add(field);
	}
	const where: Where[] = [];
	for (const field of fields) {
		const value = provider[field];
		if (value === undefined || !isSnapshotScalar(value)) continue;
		where.push({ field, value });
	}
	return where;
}

function providerMutationConflict(): APIError {
	return new APIError("CONFLICT", {
		code: "SSO_PROVIDER_CHANGED",
		message: "SSO provider changed while the mutation was in progress",
	});
}

async function readProviderForMutation(
	ctx: { context: AuthContext },
	provider: Pick<SSOProviderRecord, "id" | "providerId">,
	mode: ProviderMutationMode,
): Promise<SSOProviderRecord | null> {
	if (mode === "transactional") {
		return lockSSOProviderRow(ctx.context, provider);
	}
	const database = await getCurrentAdapter(ctx.context.adapter);
	return database.findOne<SSOProviderRecord>({
		model: "ssoProvider",
		where: [
			{ field: "id", value: provider.id },
			{ field: "providerId", value: provider.providerId },
		],
	});
}

export async function lockSSOProviderForAccountLink(
	ctx: { context: AuthContext },
	provider: ProviderIdentitySnapshot,
) {
	if (typeof provider.id !== "string") {
		return;
	}
	const lockedProvider = await lockSSOProviderRow(ctx.context, {
		id: provider.id,
		providerId: provider.providerId,
	});
	if (!lockedProvider) {
		throw new APIError("CONFLICT", {
			code: "SSO_PROVIDER_CHANGED",
			message: "SSO provider changed while account linking was in progress",
		});
	}

	if (ssoProviderAuthBoundaryChanged(provider, lockedProvider)) {
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
					callbackUrl: samlConfig.callbackUrl,
					idpInitiatedCallbackUrl: samlConfig.idpInitiatedCallbackUrl,
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
	"idpInitiatedCallbackUrl" | "idpMetadata" | "spMetadata"
> & {
	idpInitiatedCallbackUrl?: string | null | undefined;
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
		idpInitiatedCallbackUrl:
			updates.idpInitiatedCallbackUrl === null
				? undefined
				: (updates.idpInitiatedCallbackUrl ?? current.idpInitiatedCallbackUrl),
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
						"Partially update an SSO provider. A supplied OIDC or SAML mapping replaces the entire previous mapping. If the domain changes, domainVerified is reset to false.",
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

			const authorizedProvider = await checkProviderAccess(ctx, providerId);
			const mutationMode = await resolveProviderMutationMode(
				options,
				ctx.context.adapter,
			);

			const performProviderUpdate = async () => {
				const database = await getCurrentAdapter(ctx.context.adapter);
				const existingProvider = await readProviderForMutation(
					ctx,
					{ id: authorizedProvider.id, providerId },
					mutationMode,
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
					body.issuer !== undefined && body.issuer !== existingProvider.issuer;
				let trustAnchorsChanged = false;

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
					const maxMetadataSize =
						options?.saml?.maxMetadataSize ?? DEFAULT_MAX_SAML_METADATA_SIZE;
					assertSAMLMetadataSize(
						body.samlConfig.idpMetadata?.metadata,
						"IdP",
						maxMetadataSize,
					);
					assertSAMLMetadataSize(
						body.samlConfig.spMetadata?.metadata,
						"SP",
						maxMetadataSize,
					);

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
					assertSAMLServiceProviderMetadataPolicy(updatedSamlConfig);
					const changes = samlBoundaryChanges(
						currentSamlConfig,
						updatedSamlConfig,
					);
					if (changes.identity) {
						providerIdentityBoundaryChanged = true;
					}
					trustAnchorsChanged = changes.trustAnchors;

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

				await guardSSOProviderMutation(
					options,
					{
						action: "update",
						isAuthenticationBoundaryChange:
							providerIdentityBoundaryChanged || trustAnchorsChanged,
					},
					existingProvider,
					database,
					ctx.context.logger,
				);

				if (providerIdentityBoundaryChanged) {
					if (mutationMode === "optimistic") {
						// The linked-account check cannot be serialized with account
						// linking without a native transaction. Refuse identity changes
						// rather than allowing a link to race the check and the write.
						throw new APIError("NOT_IMPLEMENTED", {
							code: "SSO_PROVIDER_IDENTITY_CHANGE_REQUIRES_NATIVE_TRANSACTIONS",
							message:
								"Changing SSO provider identity fields requires a database adapter with native transaction support",
						});
					}
					const linkedAccount = await database.findOne<{ id: string }>({
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

				if (mutationMode === "optimistic") {
					// The guard evaluated this exact snapshot. Apply the update only
					// while the row still matches it. Use `updateMany` because its
					// affected-row count is reliable across adapters; Drizzle MySQL
					// cannot return the updated row or report a zero-row update from
					// `update` without rewriting the snapshot predicate.
					const updatedCount = await database.updateMany({
						model: "ssoProvider",
						where: getProviderMutationSnapshotWhere(existingProvider),
						update: updateData,
					});
					if (updatedCount !== 1) throw providerMutationConflict();
					const updatedProvider = await database.findOne<SSOProviderRecord>({
						model: "ssoProvider",
						where: [
							{ field: "id", value: existingProvider.id },
							{ field: "providerId", value: providerId },
						],
					});
					if (!updatedProvider) throw providerMutationConflict();
					return updatedProvider;
				}

				await database.update({
					model: "ssoProvider",
					where: [{ field: "providerId", value: providerId }],
					update: updateData,
				});

				const updatedProvider = await database.findOne<SSOProviderRecord>({
					model: "ssoProvider",
					where: [{ field: "providerId", value: providerId }],
				});

				if (!updatedProvider) {
					throw new APIError("NOT_FOUND", {
						message: "Provider not found after update",
					});
				}

				return updatedProvider;
			};

			const fullProvider =
				mutationMode === "transactional"
					? await runWithTransaction(ctx.context.adapter, performProviderUpdate)
					: await performProviderUpdate();

			return ctx.json(
				sanitizeProvider(fullProvider, ctx.context.baseURL, options),
			);
		},
	);
};

export const deleteSSOProvider = (options?: SSOOptions) => {
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

			const authorizedProvider = await checkProviderAccess(ctx, providerId);
			const mutationMode = await resolveProviderMutationMode(
				options,
				ctx.context.adapter,
			);

			const performProviderDelete = async () => {
				const database = await getCurrentAdapter(ctx.context.adapter);
				const existingProvider = await readProviderForMutation(
					ctx,
					{ id: authorizedProvider.id, providerId },
					mutationMode,
				);
				if (!existingProvider) {
					throw new APIError("NOT_FOUND", {
						message: "Provider not found",
					});
				}
				await guardSSOProviderMutation(
					options,
					{ action: "delete" },
					existingProvider,
					database,
					ctx.context.logger,
				);
				if (mutationMode === "optimistic") {
					// Account cleanup cannot be atomic with provider deletion without
					// a native transaction, and a failed cleanup would leave accounts
					// usable by a later provider that reuses this providerId.
					const linkedAccount = await database.findOne<{ id: string }>({
						model: "account",
						where: [{ field: "providerId", value: providerId }],
					});
					if (linkedAccount) {
						throw new APIError("NOT_IMPLEMENTED", {
							code: "SSO_PROVIDER_DELETE_WITH_LINKED_ACCOUNTS_REQUIRES_NATIVE_TRANSACTIONS",
							message:
								"Deleting an SSO provider with linked accounts requires a database adapter with native transaction support",
						});
					}
					// The provider row is the commit point: remove it only while it
					// still matches the snapshot the guard approved.
					const deleted = await database.deleteMany({
						model: "ssoProvider",
						where: getProviderMutationSnapshotWhere(existingProvider),
					});
					if (deleted !== 1) throw providerMutationConflict();
					return;
				}
				await database.deleteMany({
					model: "account",
					where: [{ field: "providerId", value: providerId }],
				});
				await database.delete({
					model: "ssoProvider",
					where: [
						{ field: "id", value: existingProvider.id },
						{ field: "providerId", value: providerId },
					],
				});
			};

			if (mutationMode === "transactional") {
				await runWithTransaction(ctx.context.adapter, performProviderDelete);
			} else {
				await performProviderDelete();
			}

			return ctx.json({ success: true });
		},
	);
};
