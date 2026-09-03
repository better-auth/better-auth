import type { BetterAuthOptions } from "@better-auth/core";
import type { BetterAuthDBSchema } from "@better-auth/core/db";
import {
	createLocalAccountIssuer,
	createOAuthAccountIssuer,
} from "@better-auth/core/db";
import { getDatabaseIndexStringLength } from "@better-auth/core/db/internal";
import { BetterAuthError } from "@better-auth/core/error";
import type { OAuthProvider } from "@better-auth/core/oauth2";
import type { SocialProviders } from "@better-auth/core/social-providers";
import { socialProviders } from "@better-auth/core/social-providers";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import type { Kysely, TableMetadata } from "kysely";
import { sql } from "kysely";
import type { Entries } from "type-fest";
import { resolveStaticOAuthAccountIssuer } from "../oauth2/account-key";
import type { GenericOAuthConfig } from "../plugins/generic-oauth/types";
import { getAdapter } from "./adapter-kysely";
import { getSchemaFromAuthTables } from "./get-schema";
import type { MigrationDatabase } from "./migration-database";
import { getMigrationDatabase } from "./migration-database";

// cspell:ignore conindid indexrelid

const PORTABLE_IDENTIFIER_BYTE_LIMIT = 63;

const LEGACY_BACKUP_SUFFIX = "__better_auth_1_6";

/** A 1.6 model whose physical table name no 1.7 configuration can supply. */
export type LegacyReleaseModel =
	| "oauthAccessToken"
	| "oauthApplication"
	| "oauthConsent"
	| "scimProvider";

interface LegacyTableShape {
	/** Columns every 1.6 table of this model carries. */
	columns: readonly string[];
	/** Columns only the 1.7 replacement carries. */
	replacementColumns: readonly string[];
}

const legacyTableShapes: Record<LegacyReleaseModel, LegacyTableShape> = {
	oauthAccessToken: {
		columns: ["accessToken", "clientId", "refreshToken", "scopes"],
		replacementColumns: ["token"],
	},
	oauthApplication: {
		columns: ["clientId", "redirectUrls"],
		replacementColumns: ["redirectUris"],
	},
	oauthConsent: {
		columns: ["clientId", "consentGiven", "scopes"],
		replacementColumns: ["requestedUserInfoClaims"],
	},
	scimProvider: {
		columns: ["providerId", "scimToken"],
		replacementColumns: [],
	},
};

export interface TableDataMoveBlocker {
	code: "table-data-move";
	migration: "1.7-provider-client-store";
	sourceTable: string;
	targetTable: string;
}

export interface ReprovisionDataBlocker {
	code: "reprovision-data";
	migration: "1.7-scim";
	sourceTables: string[];
	targetTables: string[];
}

export interface RetiredTableDataBlocker {
	code: "retired-table-data";
	migration: "1.7-provider-token-store";
	table: string;
}

export interface TableDataConversionBlocker {
	code: "table-data-conversion";
	conversion: "space-delimited-string-to-string-array";
	migration: "1.7-provider-consent-store";
	sourceTable: string;
	targetTable: string;
}

/** Storage policy used by the 1.6 OAuth provider for client secrets. */
export type OAuthClientSecretStorage =
	| "custom"
	| "encrypted"
	| "hashed"
	| "plain";

/** Reviewed client-secret policy transition applied during a 1.6 migration. */
export interface OAuthClientSecretStorageTransition {
	source: OAuthClientSecretStorage;
	target: Exclude<OAuthClientSecretStorage, "plain">;
}

export type ReleaseMigrationBlocker =
	| TableDataMoveBlocker
	| ReprovisionDataBlocker
	| RetiredTableDataBlocker
	| TableDataConversionBlocker;

/**
 * A 1.6 release decision that is missing, ambiguous, or contradicted by the
 * stored data, reported with the values needed to resolve it.
 */
export type MigrationDecisionBlocker =
	| {
			code: "account-identity-collision";
			issuer: string;
			providerAccountId: string;
			providerIds: string[];
			table: string;
	  }
	| {
			accountCount: number;
			code: "account-identity-strategy-required";
			providerIds: string[];
			table: string;
	  }
	| {
			accountCount: number;
			code: "account-identity-strategy-unsupported";
			providerIds: string[];
			table: string;
	  }
	| {
			accountId: string;
			code: "account-issuer-conflict";
			requestedIssuer: string;
			storedIssuer: string;
			table: string;
	  }
	| {
			backupTable: string;
			code: "backup-table-conflict";
			conflict: "backup-table-exists" | "unexpected-backup-schema";
			table: string;
	  }
	| {
			code: "identifier-length-limit";
			identifier: string;
			limit: number;
			table: string;
	  }
	| {
			candidateTables: string[];
			code: "legacy-table-candidate";
			model: LegacyReleaseModel;
			table: string;
	  }
	| {
			clientId: string;
			code: "oauth-client-conflict";
			conflict: "missing-redirect-uri" | "redirect-uri-mismatch";
			table: string;
	  }
	| {
			code: "oauth-client-decision-required";
			rowCount: number;
			table: string;
			target: OAuthClientSecretStorageTransition["target"];
	  }
	| {
			code: "oauth-client-secret-target-conflict";
			configuredTarget: OAuthClientSecretStorageTransition["target"];
			requestedTarget: OAuthClientSecretStorageTransition["target"];
			table: string;
	  }
	| {
			code: "oauth-client-secret-transition-unsupported";
			rowCount: number;
			source: OAuthClientSecretStorageTransition["source"];
			table: string;
			target: OAuthClientSecretStorageTransition["target"];
	  }
	| {
			clientId: string;
			code: "oauth-consent-conflict";
			table: string;
			userId: string;
	  }
	| {
			code: "oauth-consent-decision-required";
			rowCount: number;
			table: string;
	  }
	| {
			code: "oauth-token-decision-required";
			rowCount: number;
			table: string;
	  }
	| {
			code: "scim-decision-required";
			rowCount: number;
			table: string;
	  }
	| {
			code: "scim-inventory-mismatch";
			missingAccountIds: string[];
			table: string;
			unknownAccountIds: string[];
	  };

/**
 * Renders a 1.6 release decision blocker as a single sentence naming both the
 * problem and the values that resolve it.
 */
export function describeMigrationDecisionBlocker(
	blocker: MigrationDecisionBlocker,
): string {
	switch (blocker.code) {
		case "account-identity-collision":
			return `The 1.6 account migration found duplicate issuer and provider-account identities for providers ${blocker.providerIds.map((providerId) => `"${providerId}"`).join(", ")}: issuer "${blocker.issuer}" with provider account id "${blocker.providerAccountId}".`;
		case "account-identity-strategy-required":
			return `The 1.6 account migration found ${blocker.accountCount} populated accounts without an issuer for providers ${blocker.providerIds.map((providerId) => `"${providerId}"`).join(", ")}, but account.identityStrategy is not set. Set account: { identityStrategy: "provider-id" } to preserve 1.6 identity semantics.`;
		case "account-identity-strategy-unsupported":
			return `The 1.6 account migration cannot automatically adopt issuer-scoped identity for ${blocker.accountCount} accounts from providers ${blocker.providerIds.map((providerId) => `"${providerId}"`).join(", ")}. Set account: { identityStrategy: "provider-id" } to preserve 1.6 identity semantics, or use a separately reviewed re-key migration.`;
		case "account-issuer-conflict":
			return `Account "${blocker.accountId}" already stores issuer "${blocker.storedIssuer}", which conflicts with the reviewed issuer "${blocker.requestedIssuer}".`;
		case "backup-table-conflict":
			return blocker.conflict === "backup-table-exists"
				? `Cannot retire legacy table "${blocker.table}" because backup table "${blocker.backupTable}" already exists.`
				: `Backup table "${blocker.backupTable}" does not have the expected 1.6 schema.`;
		case "identifier-length-limit":
			return `The automatic backup table name "${blocker.identifier}" for "${blocker.table}" exceeds the portable ${blocker.limit}-byte identifier limit. Configure a shorter legacy table name before migrating.`;
		case "legacy-table-candidate":
			return `The 1.6 migration found no "${blocker.model}" data in "${blocker.table}", and these tables hold the 1.6 "${blocker.model}" columns: ${blocker.candidateTables.map((table) => `"${table}"`).join(", ")}.`;
		case "oauth-client-conflict":
			return blocker.conflict === "missing-redirect-uri"
				? `OAuth client "${blocker.clientId}" has no redirect URI and cannot be migrated.`
				: `OAuth client "${blocker.clientId}" already exists with different redirect URIs.`;
		case "oauth-client-decision-required":
			return `The 1.6 OAuth client migration requires the 1.6 client secret storage policy and records the configured 1.7 target policy "${blocker.target}".`;
		case "oauth-client-secret-target-conflict":
			return `The decisions file records 1.7 OAuth client secret storage "${blocker.requestedTarget}", but the configured OAuth provider uses "${blocker.configuredTarget}".`;
		case "oauth-client-secret-transition-unsupported":
			return `The 1.6 OAuth client migration cannot safely move client secrets from "${blocker.source}" storage to "${blocker.target}" storage. Rotate or re-register the confidential clients.`;
		case "oauth-consent-conflict":
			return `OAuth consent for client "${blocker.clientId}" and user "${blocker.userId}" already exists with different scopes.`;
		case "oauth-consent-decision-required":
			return 'The 1.6 OAuth consent migration requires consents: "migrate" or "reauthorize".';
		case "oauth-token-decision-required":
			return 'The 1.6 OAuth token migration requires tokens: "revoke".';
		case "scim-decision-required":
			return 'The 1.6 SCIM migration requires providers: "reprovision" and an explicit accountIdsToRetire inventory.';
		case "scim-inventory-mismatch":
			return `The SCIM account retirement inventory must exactly match every account owned by the legacy SCIM providers. Missing: ${blocker.missingAccountIds.join(", ") || "none"}. Unknown: ${blocker.unknownAccountIds.join(", ") || "none"}.`;
	}
}

function reportMigrationDecisionBlocker(
	blockers: MigrationDecisionBlocker[] | undefined,
	blocker: MigrationDecisionBlocker,
) {
	if (!blockers) {
		throw new BetterAuthError(describeMigrationDecisionBlocker(blocker));
	}
	blockers.push(blocker);
}

function getMigrationDecisionBlockerKey(blocker: MigrationDecisionBlocker) {
	return Object.entries(blocker)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([field, value]) => `${field}=${JSON.stringify(value)}`)
		.join("\u001f");
}

/** Why a provider's issuer cannot be derived from configuration alone. */
type UnresolvedIssuerReason = "discovery-issuer" | "dynamic-issuer";

type ProviderIdentityKind = "external" | "local";

type ProviderIssuerResolution =
	| { identityKind: ProviderIdentityKind; issuer: string }
	| {
			identityKind: "external";
			unresolved: UnresolvedIssuerReason;
	  };

type ProviderIssuerEntry = readonly [string, ProviderIssuerResolution];

function createProviderScopedMigrationIssuer(
	providerId: string,
	identityKind: ProviderIdentityKind,
): string {
	return identityKind === "local"
		? createLocalAccountIssuer(providerId)
		: createOAuthAccountIssuer(providerId);
}

interface ConfiguredAccountIssuers {
	/** Persisted identity namespace the 1.7 runtime uses for each provider. */
	issuers: Record<string, string>;
	/** Providers whose issuer only exists once discovery or a sign-in runs. */
	unresolvedProviders: Record<string, UnresolvedIssuerReason>;
}

function resolveSocialProviderIssuer(
	provider: OAuthProvider,
): ProviderIssuerResolution {
	const issuer = resolveStaticOAuthAccountIssuer(provider);
	return issuer
		? { identityKind: "external", issuer }
		: { identityKind: "external", unresolved: "dynamic-issuer" };
}

function resolveGenericOAuthIssuers(
	pluginOptions: Record<string, unknown> | undefined,
): ProviderIssuerEntry[] {
	const declared: unknown = pluginOptions?.config;
	if (!Array.isArray(declared)) return [];
	const providerConfigs: readonly unknown[] = declared;
	return providerConfigs.flatMap((entry): ProviderIssuerEntry[] => {
		if (typeof entry !== "object" || entry === null) return [];
		const { accountIssuer, discoveryUrl, providerId } =
			entry as Partial<GenericOAuthConfig>;
		if (!providerId) return [];
		if (typeof accountIssuer === "function") {
			return [
				[
					providerId,
					{ identityKind: "external", unresolved: "dynamic-issuer" },
				],
			];
		}
		if (accountIssuer === undefined && discoveryUrl) {
			return [
				[
					providerId,
					{ identityKind: "external", unresolved: "discovery-issuer" },
				],
			];
		}
		const issuer = resolveStaticOAuthAccountIssuer({
			accountIssuer,
			id: providerId,
		});
		return issuer ? [[providerId, { identityKind: "external", issuer }]] : [];
	});
}

function resolvePluginIssuers(
	plugins: BetterAuthOptions["plugins"],
): ProviderIssuerEntry[] {
	return (plugins ?? []).flatMap((plugin): ProviderIssuerEntry[] => {
		const pluginOptions: Record<string, unknown> | undefined = plugin.options;
		switch (plugin.id) {
			case "generic-oauth":
				return resolveGenericOAuthIssuers(pluginOptions);
			case "siwe":
				return [
					[
						"siwe",
						{
							identityKind: "local",
							issuer: createLocalAccountIssuer("siwe"),
						},
					],
				];
			default:
				return [];
		}
	});
}

interface ConfiguredIssuerState extends ConfiguredAccountIssuers {
	providerKinds: Record<string, ProviderIdentityKind>;
}

async function resolveConfiguredIssuerState(
	config: BetterAuthOptions,
	identityStrategy = config.account?.identityStrategy,
): Promise<ConfiguredIssuerState> {
	const resolutions = new Map<string, ProviderIssuerResolution>();
	for (const [providerId, providerConfig] of Object.entries(
		config.socialProviders || {},
	) as unknown as Entries<SocialProviders>) {
		const resolvedConfig =
			typeof providerConfig === "function"
				? await providerConfig()
				: providerConfig;
		if (resolvedConfig == null || resolvedConfig.enabled === false) continue;
		const provider = socialProviders[providerId](
			resolvedConfig as never,
		) as OAuthProvider;
		resolutions.set(provider.id, resolveSocialProviderIssuer(provider));
	}
	// Plugin providers are registered ahead of social providers, so a shared
	// provider id resolves to the plugin's issuer.
	for (const [providerId, resolution] of resolvePluginIssuers(config.plugins)) {
		resolutions.set(providerId, resolution);
	}

	const issuers: Record<string, string> = {
		credential: createLocalAccountIssuer("credential"),
	};
	const providerKinds: Record<string, ProviderIdentityKind> = {
		credential: "local",
	};
	const unresolvedProviders: Record<string, UnresolvedIssuerReason> = {};
	for (const [providerId, resolution] of resolutions) {
		providerKinds[providerId] = resolution.identityKind;
		if (identityStrategy === "provider-id") {
			issuers[providerId] = createProviderScopedMigrationIssuer(
				providerId,
				resolution.identityKind,
			);
			continue;
		}
		if ("issuer" in resolution) {
			issuers[providerId] = resolution.issuer;
			continue;
		}
		unresolvedProviders[providerId] = resolution.unresolved;
	}
	return { issuers, providerKinds, unresolvedProviders };
}

/** Explicit data decisions required to migrate a populated 1.6 database. */
export interface MigrateFrom16Options {
	/**
	 * Physical names used by customized 1.6 plugin schemas. `null` records that
	 * no customized table holds that model's 1.6 data, which settles the
	 * candidates the shape scan proposes.
	 */
	legacyTableNames?: {
		oauthAccessToken?: string | null | undefined;
		oauthApplication?: string | null | undefined;
		oauthConsent?: string | null | undefined;
		scimProvider?: string | null | undefined;
	};
	/** Explicit policy for data owned by the retired 1.6 OIDC provider. */
	oauthProvider?: {
		clients: "migrate";
		clientSecrets?: OAuthClientSecretStorageTransition | undefined;
		consents: "migrate" | "reauthorize";
		tokens: "revoke";
	};
	/** Explicit acknowledgement that 1.6 SCIM data requires reprovisioning. */
	scim?: {
		accountIdsToRetire: readonly string[];
		providers: "reprovision";
	};
}

export interface MigratedAccountSummary {
	migrated: number;
	providers: Record<string, number>;
}

export interface MigratedOAuthProviderSummary {
	clients: {
		backupTable?: string | undefined;
		migrated: number;
	};
	consents: {
		backupTable?: string | undefined;
		migrated: number;
		reauthorizationRequired: number;
	};
	tokens: {
		backupTable?: string | undefined;
		revoked: number;
	};
}

export interface MigratedScimSummary {
	backupTable?: string | undefined;
	identities: Array<{
		providerAccountId: string;
		providerId: string;
		userId: string;
	}>;
	reprovisionRequired: boolean;
	retiredProviders: number;
}

interface ReleaseMigrationInspection {
	authTables: BetterAuthDBSchema;
	existingTables: readonly {
		columns: readonly { name: string }[];
		name: string;
	}[];
	legacyTableNames?: {
		oauthAccessToken?: string | null | undefined;
		oauthApplication?: string | null | undefined;
		oauthConsent?: string | null | undefined;
		scimProvider?: string | null | undefined;
	};
	tableContainsRows: (table: string) => Promise<boolean>;
}

interface AccountProviderCount {
	count: bigint | number | string;
	providerId: string;
}

interface LegacyAccountIdentityRow {
	id: string;
	issuer?: string | null | undefined;
	providerAccountId: string;
	providerId: string;
}

export interface AccountIdentityMigrationAssessment {
	selectedStrategy: "provider-id" | "issuer";
	detectedStrategy: "empty" | "provider-id" | "issuer" | "mixed";
	affectedProviders?: string[] | undefined;
	physicalSchema?:
		| {
				accountIdColumn: string;
				issuerColumn: string;
				table: string;
		  }
		| undefined;
	migrationRequired: boolean;
	requiresRekey: boolean;
	totalAccounts?: number;
	externalAccounts?: number;
	automaticNamespaceResolution?:
		| { resolved: number; total: number }
		| undefined;
	projectedCollisions?: number;
	malformedNamespaces?: number | undefined;
	compatibilityWarning?: string | undefined;
}

/** Inspects the configured account-identity path without changing the database. */
export async function inspectAccountIdentityMigration(
	config: BetterAuthOptions,
	database: MigrationDatabase,
	existingTables: readonly TableMetadata[],
): Promise<AccountIdentityMigrationAssessment> {
	const accountSchema = database.inspectionAuthTables.account;
	const selectedStrategy: AccountIdentityMigrationAssessment["selectedStrategy"] =
		config.account?.identityStrategy === "provider-id"
			? "provider-id"
			: "issuer";
	const omittedStrategyWarning =
		config.account?.identityStrategy === undefined
			? 'account.identityStrategy is omitted; Better Auth v1.7 compatibility mode is using issuer identity. Add account: { identityStrategy: "issuer" } to make this behavior explicit. For a new database, use account: { identityStrategy: "provider-id" } instead. Run auth migrate plan before changing populated account data.'
			: undefined;
	const createEmptyAssessment = (
		physicalSchema?: AccountIdentityMigrationAssessment["physicalSchema"],
	): AccountIdentityMigrationAssessment => ({
		selectedStrategy,
		detectedStrategy: "empty",
		physicalSchema,
		migrationRequired: false,
		requiresRekey: false,
		totalAccounts: 0,
		externalAccounts: 0,
		projectedCollisions: 0,
		compatibilityWarning: omittedStrategyWarning,
	});
	if (!accountSchema) return createEmptyAssessment();
	const physicalSchema = {
		accountIdColumn: accountSchema.fields.accountId?.fieldName || "accountId",
		issuerColumn: accountSchema.fields.issuer?.fieldName || "issuer",
		table: accountSchema.modelName || "account",
	};
	const emptyAssessment = createEmptyAssessment(physicalSchema);
	const accountTable = physicalSchema.table;
	const tableMetadata = existingTables.find(
		(table) => table.name === accountTable,
	);
	if (!tableMetadata) return emptyAssessment;
	const columns = new Set(tableMetadata.columns.map((column) => column.name));
	const accountIdColumn = physicalSchema.accountIdColumn;
	const providerIdColumn =
		accountSchema.fields.providerId?.fieldName || "providerId";
	const issuerColumn = physicalSchema.issuerColumn;
	if (!columns.has(accountIdColumn) || !columns.has(providerIdColumn)) {
		throw new BetterAuthError(
			`Account identity inspection could not resolve the physical provider columns on table "${accountTable}".`,
		);
	}
	const rows = await sql<
		Pick<
			LegacyAccountIdentityRow,
			"issuer" | "providerAccountId" | "providerId"
		>
	>`
		SELECT
			${sql.ref(accountIdColumn)} AS "providerAccountId",
			${sql.ref(providerIdColumn)} AS "providerId",
			${columns.has(issuerColumn) ? sql.ref(issuerColumn) : sql`NULL`} AS "issuer"
		FROM ${sql.table(accountTable)}
	`.execute(database.kysely);
	const accounts = rows.rows;
	if (accounts.length === 0) return emptyAssessment;
	const accountsWithIssuer = accounts.filter((account) =>
		Boolean(readStoredIssuer(account.issuer)),
	).length;
	const physicalSchemaComplete =
		columns.has(issuerColumn) && accountsWithIssuer === accounts.length;
	let configured: ConfiguredIssuerState = {
		issuers: {},
		providerKinds: { credential: "local", siwe: "local" },
		unresolvedProviders: {},
	};
	const affectedProviders = new Set<string>();
	let malformedNamespaces = 0;
	let detectedStrategy: AccountIdentityMigrationAssessment["detectedStrategy"];
	if (!physicalSchemaComplete) {
		detectedStrategy = accountsWithIssuer === 0 ? "provider-id" : "mixed";
		if (detectedStrategy === "mixed") {
			for (const account of accounts) affectedProviders.add(account.providerId);
		}
	} else {
		if (selectedStrategy === "issuer") {
			configured = await resolveConfiguredIssuerState(config, "issuer");
		}
		let providerScopedEvidence = false;
		let issuerScopedEvidence = false;
		for (const account of accounts) {
			const storedIssuer = readStoredIssuer(account.issuer);
			if (!storedIssuer) continue;
			const identityKind =
				configured.providerKinds[account.providerId] ??
				(account.providerId === "credential" || account.providerId === "siwe"
					? "local"
					: "external");
			const providerScopedIssuer = createProviderScopedMigrationIssuer(
				account.providerId,
				identityKind,
			);
			const usesReservedProviderNamespace =
				storedIssuer.startsWith("local:oauth:") ||
				(identityKind === "local" && storedIssuer.startsWith("local:"));
			if (
				usesReservedProviderNamespace &&
				storedIssuer !== providerScopedIssuer
			) {
				malformedNamespaces++;
				affectedProviders.add(account.providerId);
				continue;
			}
			const configuredIssuer = configured.issuers[account.providerId];
			if (configuredIssuer === providerScopedIssuer) continue;
			if (storedIssuer === providerScopedIssuer) {
				providerScopedEvidence = true;
			} else {
				issuerScopedEvidence = true;
			}
		}
		detectedStrategy =
			malformedNamespaces > 0 ||
			(providerScopedEvidence && issuerScopedEvidence)
				? "mixed"
				: providerScopedEvidence
					? "provider-id"
					: issuerScopedEvidence
						? "issuer"
						: selectedStrategy;
	}
	// Mixed rows are never safe to infer. A complete issuer column can be
	// compared with the configured strategy to recognize an already-migrated
	// v1.7 database that would require a reviewed re-key.
	const requiresRekey =
		detectedStrategy === "mixed" ||
		(physicalSchemaComplete && detectedStrategy !== selectedStrategy);
	if (requiresRekey && affectedProviders.size === 0) {
		for (const account of accounts) affectedProviders.add(account.providerId);
	}
	const resolveProviderKind = (providerId: string): ProviderIdentityKind =>
		configured.providerKinds[providerId] ??
		(providerId === "credential" || providerId === "siwe"
			? "local"
			: "external");
	const externalAccounts = accounts.filter(
		(account) => resolveProviderKind(account.providerId) === "external",
	);
	const resolveProjectedNamespace = (account: (typeof accounts)[number]) => {
		if (selectedStrategy === "provider-id") {
			return createProviderScopedMigrationIssuer(
				account.providerId,
				resolveProviderKind(account.providerId),
			);
		}
		return (
			readStoredIssuer(account.issuer) || configured.issuers[account.providerId]
		);
	};
	const projectedIdentities = new Map<string, string>();
	const projectedCollisionIdentities = new Set<string>();
	for (const account of accounts) {
		const namespace = resolveProjectedNamespace(account);
		if (!namespace) continue;
		const identity = JSON.stringify([namespace, account.providerAccountId]);
		const existingProviderId = projectedIdentities.get(identity);
		if (existingProviderId) {
			projectedCollisionIdentities.add(identity);
			affectedProviders.add(existingProviderId);
			affectedProviders.add(account.providerId);
		} else {
			projectedIdentities.set(identity, account.providerId);
		}
	}
	const compatibilityWarning =
		config.account?.identityStrategy === undefined &&
		detectedStrategy === "issuer"
			? omittedStrategyWarning
			: undefined;
	return {
		selectedStrategy,
		detectedStrategy,
		affectedProviders: [...affectedProviders].sort(),
		physicalSchema,
		migrationRequired: !physicalSchemaComplete || requiresRekey,
		requiresRekey,
		totalAccounts: accounts.length,
		externalAccounts: externalAccounts.length,
		automaticNamespaceResolution: {
			resolved: externalAccounts.filter((account) =>
				Boolean(resolveProjectedNamespace(account)),
			).length,
			total: externalAccounts.length,
		},
		projectedCollisions: projectedCollisionIdentities.size,
		malformedNamespaces,
		compatibilityWarning,
	};
}

interface LegacyOAuthClientRow {
	clientId: string;
	clientSecret?: string | null | undefined;
	createdAt: Date | string;
	disabled?: boolean | number | null | undefined;
	icon?: string | null | undefined;
	metadata?: string | null | undefined;
	name: string;
	redirectUrls: string;
	type: string;
	updatedAt: Date | string;
	userId?: string | null | undefined;
}

interface LegacyOAuthConsentRow {
	clientId: string;
	consentGiven: boolean | number;
	createdAt: Date | string;
	scopes: string;
	updatedAt: Date | string;
	userId: string;
}

interface OAuthClientMigrationData {
	clientId: string;
	clientSecret?: string | undefined;
	createdAt: Date | string;
	disabled: boolean;
	grantTypes: string[];
	icon?: string | undefined;
	metadata?: unknown;
	name: string;
	public: boolean;
	redirectUris: string[];
	requirePKCE?: boolean | undefined;
	responseTypes: string[];
	tokenEndpointAuthMethod: string;
	type?: string | undefined;
	updatedAt: Date | string;
	userId?: string | undefined;
}

interface OAuthConsentMigrationData {
	clientId: string;
	createdAt: Date | string;
	scopes: string[];
	updatedAt: Date | string;
	userId: string;
}

export interface OAuthProviderDataFrom16Plan {
	clients: Array<{
		alreadyMigrated: boolean;
		data: OAuthClientMigrationData;
	}>;
	consents: Array<
		| {
				action: "migrate";
				alreadyMigrated: boolean;
				data: OAuthConsentMigrationData;
		  }
		| {
				action: "reauthorize";
		  }
	>;
}

interface LegacyScimAccountRow {
	providerAccountId: string;
	providerId: string;
	userId: string;
}

interface LegacyScimAccountRecord extends LegacyScimAccountRow {
	id: string;
}

interface LegacyScimProviderRow {
	providerId: string;
}

interface LegacyTableState {
	backupTable: string;
	rowCount: number;
	sourceTable: string;
	sourceTableNeedsRename: boolean;
}

function toSafeRowCount(value: bigint | number | string) {
	const count = Number(value);
	if (!Number.isSafeInteger(count) || count < 0) {
		throw new BetterAuthError(`Invalid migration row count: ${String(value)}`);
	}
	return count;
}

function getLegacyBackupTableName(
	sourceTable: string,
	blockers: MigrationDecisionBlocker[] | undefined,
) {
	const backupTable = `${sourceTable}${LEGACY_BACKUP_SUFFIX}`;
	if (
		new TextEncoder().encode(backupTable).length >
		PORTABLE_IDENTIFIER_BYTE_LIMIT
	) {
		reportMigrationDecisionBlocker(blockers, {
			code: "identifier-length-limit",
			identifier: backupTable,
			limit: PORTABLE_IDENTIFIER_BYTE_LIMIT,
			table: sourceTable,
		});
		return undefined;
	}
	return backupTable;
}

async function countTableRows(kysely: Kysely<unknown>, table: string) {
	const result = await sql<{ count: bigint | number | string }>`
		SELECT COUNT(*) AS "count"
		FROM ${sql.table(table)}
	`.execute(kysely);
	return toSafeRowCount(result.rows[0]?.count ?? 0);
}

function hasLegacyTableShape(
	table: TableMetadata | undefined,
	shape: LegacyTableShape,
) {
	if (!table) return false;
	const columns = new Set(table.columns.map((column) => column.name));
	return (
		shape.columns.every((column) => columns.has(column)) &&
		!shape.replacementColumns.some((column) => columns.has(column))
	);
}

async function inspectLegacyTable({
	blockers,
	kysely,
	model,
	sourceTable,
	tables,
}: {
	blockers: MigrationDecisionBlocker[] | undefined;
	kysely: Kysely<unknown>;
	model: LegacyReleaseModel;
	sourceTable: string;
	tables: readonly TableMetadata[];
}): Promise<LegacyTableState | undefined> {
	const shape = legacyTableShapes[model];
	const source = tables.find((table) => table.name === sourceTable);
	const backupTable = getLegacyBackupTableName(sourceTable, blockers);
	if (!backupTable) return undefined;
	const backup = tables.find((table) => table.name === backupTable);
	const sourceHasLegacyShape = hasLegacyTableShape(source, shape);
	const backupHasLegacyShape = hasLegacyTableShape(backup, shape);

	if (sourceHasLegacyShape && backup) {
		reportMigrationDecisionBlocker(blockers, {
			backupTable,
			code: "backup-table-conflict",
			conflict: "backup-table-exists",
			table: sourceTable,
		});
		return undefined;
	}
	if (backup && !backupHasLegacyShape) {
		reportMigrationDecisionBlocker(blockers, {
			backupTable,
			code: "backup-table-conflict",
			conflict: "unexpected-backup-schema",
			table: sourceTable,
		});
		return undefined;
	}
	const activeLegacyTable = sourceHasLegacyShape
		? sourceTable
		: backupHasLegacyShape
			? backupTable
			: undefined;
	if (!activeLegacyTable) return undefined;

	return {
		backupTable,
		rowCount: await countTableRows(kysely, activeLegacyTable),
		sourceTable,
		sourceTableNeedsRename: sourceHasLegacyShape,
	};
}

/**
 * Tables that carry a model's 1.6 columns under a name the migration was not
 * told about. A customized 1.6 schema is the only source of such a name, so a
 * candidate is reported for review and never migrated on its own.
 */
async function findLegacyTableCandidates({
	candidateTables,
	kysely,
	model,
	sourceTable,
}: {
	candidateTables: readonly TableMetadata[];
	kysely: Kysely<unknown>;
	model: LegacyReleaseModel;
	sourceTable: string;
}) {
	const shape = legacyTableShapes[model];
	const candidates: string[] = [];
	for (const table of candidateTables) {
		if (table.name === sourceTable) continue;
		if (!hasLegacyTableShape(table, shape)) continue;
		if ((await countTableRows(kysely, table.name)) === 0) continue;
		candidates.push(table.name);
	}
	return candidates.sort();
}

async function inspectLegacyModel({
	blockers,
	candidateTables,
	configuredTable,
	kysely,
	model,
	tables,
}: {
	blockers: MigrationDecisionBlocker[] | undefined;
	candidateTables: readonly TableMetadata[];
	configuredTable: string | null | undefined;
	kysely: Kysely<unknown>;
	model: LegacyReleaseModel;
	tables: readonly TableMetadata[];
}): Promise<LegacyTableState | undefined> {
	const sourceTable = configuredTable || model;
	const state = await inspectLegacyTable({
		blockers,
		kysely,
		model,
		sourceTable,
		tables,
	});
	if (state || configuredTable !== undefined) return state;
	const candidates = await findLegacyTableCandidates({
		candidateTables,
		kysely,
		model,
		sourceTable,
	});
	if (candidates.length > 0) {
		reportMigrationDecisionBlocker(blockers, {
			candidateTables: candidates,
			code: "legacy-table-candidate",
			model,
			table: sourceTable,
		});
	}
	return undefined;
}

/** Legacy 1.6 plugin tables and rename checkpoints found during preflight. */
export interface LegacyReleaseDataState {
	oauthAccessToken?: LegacyTableState | undefined;
	oauthApplication?: LegacyTableState | undefined;
	oauthConsent?: LegacyTableState | undefined;
	scimProvider?: LegacyTableState | undefined;
}

/**
 * Inspects the configured database for populated 1.6 plugin tables without
 * applying schema or data changes.
 */
export async function inspectLegacyReleaseDataFrom16(
	config: BetterAuthOptions,
	options: MigrateFrom16Options,
	blockers?: MigrationDecisionBlocker[],
): Promise<LegacyReleaseDataState> {
	const { authTables, kysely } = await getMigrationDatabase(config);
	const tables = await kysely.introspection.getTables();
	const configuredTables = new Set(
		Object.keys(getSchemaFromAuthTables(authTables)),
	);
	const configuredSchemas = new Set(
		tables
			.filter((table) => configuredTables.has(table.name))
			.map((table) => table.schema),
	);
	const candidateTables = tables.filter(
		(table) =>
			!configuredTables.has(table.name) &&
			!table.name.endsWith(LEGACY_BACKUP_SUFFIX) &&
			configuredSchemas.has(table.schema),
	);
	const inspect = async (model: LegacyReleaseModel, hasReplacement: boolean) =>
		hasReplacement
			? await inspectLegacyModel({
					blockers,
					candidateTables,
					configuredTable: options.legacyTableNames?.[model],
					kysely,
					model,
					tables,
				})
			: undefined;
	const state: LegacyReleaseDataState = {
		oauthApplication: await inspect(
			"oauthApplication",
			Boolean(authTables.oauthClient),
		),
		oauthAccessToken: await inspect(
			"oauthAccessToken",
			Boolean(authTables.oauthAccessToken),
		),
		oauthConsent: await inspect(
			"oauthConsent",
			Boolean(authTables.oauthConsent),
		),
		scimProvider: await inspect(
			"scimProvider",
			Boolean(authTables.scimConnectionBinding),
		),
	};

	if (state.oauthApplication?.rowCount) {
		const configuredTarget = resolveOAuthClientSecretStorageTarget(config);
		const transition = options.oauthProvider?.clientSecrets;
		if (options.oauthProvider?.clients !== "migrate" || !transition) {
			reportMigrationDecisionBlocker(blockers, {
				code: "oauth-client-decision-required",
				rowCount: state.oauthApplication.rowCount,
				table: state.oauthApplication.sourceTable,
				target: configuredTarget,
			});
		} else if (transition.target !== configuredTarget) {
			reportMigrationDecisionBlocker(blockers, {
				code: "oauth-client-secret-target-conflict",
				configuredTarget,
				requestedTarget: transition.target,
				table: state.oauthApplication.sourceTable,
			});
		} else if (!supportsOAuthClientSecretStorageTransition(transition)) {
			reportMigrationDecisionBlocker(blockers, {
				code: "oauth-client-secret-transition-unsupported",
				rowCount: state.oauthApplication.rowCount,
				source: transition.source,
				table: state.oauthApplication.sourceTable,
				target: transition.target,
			});
		}
	}
	if (
		state.oauthAccessToken?.rowCount &&
		options.oauthProvider?.tokens !== "revoke"
	) {
		reportMigrationDecisionBlocker(blockers, {
			code: "oauth-token-decision-required",
			rowCount: state.oauthAccessToken.rowCount,
			table: state.oauthAccessToken.sourceTable,
		});
	}
	if (state.oauthConsent?.rowCount && !options.oauthProvider?.consents) {
		reportMigrationDecisionBlocker(blockers, {
			code: "oauth-consent-decision-required",
			rowCount: state.oauthConsent.rowCount,
			table: state.oauthConsent.sourceTable,
		});
	}
	if (
		state.scimProvider?.rowCount &&
		(options.scim?.providers !== "reprovision" ||
			!Array.isArray(options.scim.accountIdsToRetire))
	) {
		reportMigrationDecisionBlocker(blockers, {
			code: "scim-decision-required",
			rowCount: state.scimProvider.rowCount,
			table: state.scimProvider.sourceTable,
		});
	}
	if ((blockers?.length ?? 0) === 0) {
		const completionBlockers: MigrationDecisionBlocker[] = [];
		const oauthProvider = await prepareOAuthProviderDataFrom16(
			config,
			options,
			state,
			completionBlockers,
		);
		const scimAccounts = await inspectScimAccountsFrom16(
			config,
			options,
			state,
			completionBlockers,
		);
		if (completionBlockers.length === 0) {
			if (
				state.oauthApplication &&
				!state.oauthApplication.sourceTableNeedsRename &&
				oauthProvider?.clients.every((client) => client.alreadyMigrated)
			) {
				state.oauthApplication = undefined;
			}
			if (
				state.oauthAccessToken &&
				!state.oauthAccessToken.sourceTableNeedsRename &&
				options.oauthProvider?.tokens === "revoke"
			) {
				state.oauthAccessToken = undefined;
			}
			if (
				state.oauthConsent &&
				!state.oauthConsent.sourceTableNeedsRename &&
				(options.oauthProvider?.consents === "reauthorize" ||
					(options.oauthProvider?.consents === "migrate" &&
						oauthProvider?.consents.every(
							(consent) =>
								consent.action === "reauthorize" || consent.alreadyMigrated,
						)))
			) {
				state.oauthConsent = undefined;
			}
			if (
				state.scimProvider &&
				!state.scimProvider.sourceTableNeedsRename &&
				options.scim &&
				scimAccounts.length === 0
			) {
				state.scimProvider = undefined;
			}
		}
	}
	return state;
}

export async function renameLegacyTables(
	config: BetterAuthOptions,
	state: LegacyReleaseDataState,
	migrationDatabase?: MigrationDatabase,
) {
	const { databaseType, kysely } =
		migrationDatabase ?? (await getMigrationDatabase(config));
	for (const table of [
		state.oauthApplication,
		state.oauthAccessToken,
		state.oauthConsent,
		state.scimProvider,
	]) {
		if (!table?.sourceTableNeedsRename) continue;
		if (databaseType === "mssql") {
			await sql`
				EXEC sp_rename ${table.sourceTable}, ${table.backupTable}
			`.execute(kysely);
		} else {
			await kysely.schema
				.alterTable(table.sourceTable)
				.renameTo(table.backupTable)
				.execute();
		}
		if (databaseType === "postgres") {
			const indexes = await sql<{ name: string }>`
				SELECT index_class.relname AS "name"
				FROM pg_class AS table_class
				JOIN pg_namespace AS table_namespace
					ON table_namespace.oid = table_class.relnamespace
				JOIN pg_index AS table_index
					ON table_index.indrelid = table_class.oid
				JOIN pg_class AS index_class
					ON index_class.oid = table_index.indexrelid
				LEFT JOIN pg_constraint AS index_constraint
					ON index_constraint.conindid = index_class.oid
				WHERE
					table_namespace.nspname = current_schema() AND
					table_class.relname = ${table.backupTable} AND
					index_constraint.oid IS NULL
			`.execute(kysely);
			for (const index of indexes.rows) {
				await kysely.schema.dropIndex(index.name).ifExists().execute();
			}
		}
		if (databaseType === "sqlite") {
			const indexes = await sql<{ name: string }>`
				SELECT name
				FROM sqlite_master
				WHERE
					type = 'index' AND
					tbl_name = ${table.backupTable} AND
					sql IS NOT NULL
			`.execute(kysely);
			for (const index of indexes.rows) {
				await kysely.schema.dropIndex(index.name).ifExists().execute();
			}
		}
	}
	const renamed = (table: LegacyTableState | undefined) =>
		table ? { ...table, sourceTableNeedsRename: false } : undefined;
	return {
		oauthAccessToken: renamed(state.oauthAccessToken),
		oauthApplication: renamed(state.oauthApplication),
		oauthConsent: renamed(state.oauthConsent),
		scimProvider: renamed(state.scimProvider),
	} satisfies LegacyReleaseDataState;
}

function splitLegacyList(value: string, separator: "," | " ") {
	return value
		.split(separator)
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function parseLegacyMetadata(value: string | null | undefined): unknown {
	if (!value) return undefined;
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

async function hashLegacyClientSecret(value: string) {
	const digest = await createHash("SHA-256").digest(
		new TextEncoder().encode(value),
	);
	return base64Url.encode(new Uint8Array(digest), { padding: false });
}

function resolveOAuthClientSecretStorageTarget(
	config: BetterAuthOptions,
): OAuthClientSecretStorageTransition["target"] {
	const oauthProvider = config.plugins?.find(
		(plugin) => plugin.id === "oauth-provider",
	);
	const storage = (
		oauthProvider?.options as Record<string, unknown> | undefined
	)?.storeClientSecret;
	if (storage === "encrypted" || storage === "hashed") return storage;
	return "custom";
}

function supportsOAuthClientSecretStorageTransition({
	source,
	target,
}: OAuthClientSecretStorageTransition) {
	return (
		(source === "plain" && target === "hashed") ||
		(source === "hashed" && target === "hashed") ||
		(source === "encrypted" && target === "encrypted")
	);
}

async function migrateLegacyClientSecret(
	value: string,
	transition: OAuthClientSecretStorageTransition,
) {
	if (transition.source === "plain" && transition.target === "hashed") {
		return await hashLegacyClientSecret(value);
	}
	if (
		(transition.source === "hashed" && transition.target === "hashed") ||
		(transition.source === "encrypted" && transition.target === "encrypted")
	) {
		return value;
	}
	throw new BetterAuthError(
		`Unsupported OAuth client secret storage transition from "${transition.source}" to "${transition.target}".`,
	);
}

function targetTableExists({
	existingTables,
	legacyTable,
	targetTable,
}: {
	existingTables: ReadonlySet<string>;
	legacyTable?: LegacyTableState | undefined;
	targetTable: string;
}) {
	if (!existingTables.has(targetTable)) return false;
	return !(
		legacyTable?.sourceTableNeedsRename &&
		legacyTable.sourceTable === targetTable
	);
}

export async function prepareOAuthProviderDataFrom16(
	config: BetterAuthOptions,
	options: MigrateFrom16Options,
	state: LegacyReleaseDataState,
	blockers?: MigrationDecisionBlocker[],
): Promise<OAuthProviderDataFrom16Plan | undefined> {
	if (
		!state.oauthApplication &&
		!state.oauthAccessToken &&
		!state.oauthConsent
	) {
		return undefined;
	}
	const { authTables, kysely } = await getMigrationDatabase(config);
	const adapter = await getAdapter(config);
	const existingTables = new Set(
		(await kysely.introspection.getTables()).map((table) => table.name),
	);
	const clients: OAuthProviderDataFrom16Plan["clients"] = [];
	const clientSecretStorage = options.oauthProvider?.clientSecrets;
	const canMigrateClientSecrets =
		clientSecretStorage &&
		clientSecretStorage.target ===
			resolveOAuthClientSecretStorageTarget(config) &&
		supportsOAuthClientSecretStorageTransition(clientSecretStorage);
	if (state.oauthApplication && !canMigrateClientSecrets && !blockers) {
		throw new BetterAuthError(
			"The 1.6 OAuth client migration requires a supported, reviewed client secret storage transition.",
		);
	}
	if (
		state.oauthApplication &&
		canMigrateClientSecrets &&
		clientSecretStorage
	) {
		const sourceTable = state.oauthApplication.sourceTableNeedsRename
			? state.oauthApplication.sourceTable
			: state.oauthApplication.backupTable;
		const source = await sql<LegacyOAuthClientRow>`
			SELECT *
			FROM ${sql.table(sourceTable)}
		`.execute(kysely);
		const oauthClientTable = authTables.oauthClient?.modelName || "oauthClient";
		const canInspectExistingClients = targetTableExists({
			existingTables,
			legacyTable: state.oauthApplication,
			targetTable: oauthClientTable,
		});
		for (const client of source.rows) {
			const redirectUris = splitLegacyList(client.redirectUrls, ",");
			if (redirectUris.length === 0) {
				reportMigrationDecisionBlocker(blockers, {
					clientId: client.clientId,
					code: "oauth-client-conflict",
					conflict: "missing-redirect-uri",
					table: sourceTable,
				});
				continue;
			}
			const existing = canInspectExistingClients
				? await adapter.findOne<{
						clientId: string;
						redirectUris: string[];
					}>({
						model: "oauthClient",
						where: [{ field: "clientId", value: client.clientId }],
					})
				: null;
			if (
				existing &&
				JSON.stringify(existing.redirectUris) !== JSON.stringify(redirectUris)
			) {
				reportMigrationDecisionBlocker(blockers, {
					clientId: client.clientId,
					code: "oauth-client-conflict",
					conflict: "redirect-uri-mismatch",
					table: sourceTable,
				});
				continue;
			}
			const isPublic = client.type === "public";
			clients.push({
				alreadyMigrated: Boolean(existing),
				data: {
					clientId: client.clientId,
					clientSecret:
						!isPublic && client.clientSecret
							? await migrateLegacyClientSecret(
									client.clientSecret,
									clientSecretStorage,
								)
							: undefined,
					createdAt: client.createdAt,
					disabled: Boolean(client.disabled),
					grantTypes: ["authorization_code"],
					icon: client.icon || undefined,
					metadata: parseLegacyMetadata(client.metadata),
					name: client.name,
					public: isPublic,
					redirectUris,
					requirePKCE: isPublic ? true : undefined,
					responseTypes: ["code"],
					tokenEndpointAuthMethod: isPublic ? "none" : "client_secret_basic",
					type: isPublic ? undefined : client.type,
					updatedAt: client.updatedAt,
					userId: client.userId || undefined,
				},
			});
		}
	}

	const consents: OAuthProviderDataFrom16Plan["consents"] = [];
	if (state.oauthConsent) {
		const sourceTable = state.oauthConsent.sourceTableNeedsRename
			? state.oauthConsent.sourceTable
			: state.oauthConsent.backupTable;
		const source = await sql<LegacyOAuthConsentRow>`
			SELECT *
			FROM ${sql.table(sourceTable)}
		`.execute(kysely);
		const oauthConsentTable =
			authTables.oauthConsent?.modelName || "oauthConsent";
		const canInspectExistingConsents = targetTableExists({
			existingTables,
			legacyTable: state.oauthConsent,
			targetTable: oauthConsentTable,
		});
		for (const consent of source.rows) {
			if (
				options.oauthProvider?.consents === "reauthorize" ||
				!Boolean(consent.consentGiven)
			) {
				consents.push({ action: "reauthorize" });
				continue;
			}
			const scopes = splitLegacyList(consent.scopes, " ");
			const existing = canInspectExistingConsents
				? await adapter.findOne<{
						scopes: string[];
					}>({
						model: "oauthConsent",
						where: [
							{ field: "clientId", value: consent.clientId },
							{ field: "userId", value: consent.userId },
						],
					})
				: null;
			if (
				existing &&
				JSON.stringify(existing.scopes) !== JSON.stringify(scopes)
			) {
				reportMigrationDecisionBlocker(blockers, {
					clientId: consent.clientId,
					code: "oauth-consent-conflict",
					table: sourceTable,
					userId: consent.userId,
				});
				continue;
			}
			consents.push({
				action: "migrate",
				alreadyMigrated: Boolean(existing),
				data: {
					clientId: consent.clientId,
					createdAt: consent.createdAt,
					scopes,
					updatedAt: consent.updatedAt,
					userId: consent.userId,
				},
			});
		}
	}

	return { clients, consents };
}

export async function migrateOAuthProviderDataFrom16(
	config: BetterAuthOptions,
	options: MigrateFrom16Options,
	state: LegacyReleaseDataState,
	preparedData?: OAuthProviderDataFrom16Plan | undefined,
	migrationDatabase?: MigrationDatabase | undefined,
): Promise<MigratedOAuthProviderSummary | undefined> {
	const plan =
		preparedData ??
		(await prepareOAuthProviderDataFrom16(config, options, state));
	if (!plan) return undefined;
	const recordWriter =
		migrationDatabase?.recordWriter ?? (await getAdapter(config));
	for (const client of plan.clients) {
		if (client.alreadyMigrated) continue;
		await recordWriter.create({
			model: "oauthClient",
			data: client.data,
		});
	}
	let migratedConsents = 0;
	let reauthorizationRequired = 0;
	for (const consent of plan.consents) {
		if (consent.action === "reauthorize") {
			reauthorizationRequired += 1;
			continue;
		}
		if (!consent.alreadyMigrated) {
			await recordWriter.create({
				model: "oauthConsent",
				data: consent.data,
			});
		}
		migratedConsents += 1;
	}
	return {
		clients: {
			backupTable: state.oauthApplication?.backupTable,
			migrated: plan.clients.length,
		},
		consents: {
			backupTable: state.oauthConsent?.backupTable,
			migrated: migratedConsents,
			reauthorizationRequired,
		},
		tokens: {
			backupTable: state.oauthAccessToken?.backupTable,
			revoked: state.oauthAccessToken?.rowCount ?? 0,
		},
	};
}

async function readScimAccountsFrom16(
	config: BetterAuthOptions,
	state: LegacyReleaseDataState,
	migrationDatabase?: MigrationDatabase,
): Promise<{
	accounts: LegacyScimAccountRecord[];
	accountTable: string;
}> {
	if (!state.scimProvider) return { accounts: [], accountTable: "account" };
	const database = migrationDatabase ?? (await getMigrationDatabase(config));
	const { authTables, kysely } = database;
	const providerTable = state.scimProvider.sourceTableNeedsRename
		? state.scimProvider.sourceTable
		: state.scimProvider.backupTable;
	const providers = await sql<LegacyScimProviderRow>`
		SELECT ${sql.ref("providerId")} AS "providerId"
		FROM ${sql.table(providerTable)}
	`.execute(kysely);
	const providerIds = new Set(providers.rows.map((row) => row.providerId));
	const accountSchema = authTables.account;
	if (!accountSchema) return { accounts: [], accountTable: "account" };
	const accountTable = accountSchema.modelName || "account";
	const idColumn = accountSchema.fields.id?.fieldName || "id";
	const accountIdColumn =
		accountSchema.fields.accountId?.fieldName || "accountId";
	const providerIdColumn =
		accountSchema.fields.providerId?.fieldName || "providerId";
	const userIdColumn = accountSchema.fields.userId?.fieldName || "userId";
	const accountTableMetadata = (await kysely.introspection.getTables()).find(
		(table) => table.name === accountTable,
	);
	if (!accountTableMetadata) return { accounts: [], accountTable };
	if (providerIds.size === 0) return { accounts: [], accountTable };
	const accountQuery = sql<LegacyScimAccountRecord>`
		SELECT
			${sql.ref(idColumn)} AS "id",
			${sql.ref(accountIdColumn)} AS "providerAccountId",
			${sql.ref(providerIdColumn)} AS "providerId",
			${sql.ref(userIdColumn)} AS "userId"
		FROM ${sql.table(accountTable)}
		WHERE ${sql.ref(providerIdColumn)} IN (${sql.join([...providerIds])})
	`;
	const lockedAccountQuery =
		database.databaseType === "mysql" && database.inTransaction
			? sql<LegacyScimAccountRecord>`${accountQuery} FOR UPDATE`
			: accountQuery;
	const accounts = (await lockedAccountQuery.execute(kysely)).rows;
	return { accounts: [...accounts], accountTable };
}

export async function inspectScimAccountsFrom16(
	config: BetterAuthOptions,
	options: MigrateFrom16Options,
	state: LegacyReleaseDataState,
	blockers?: MigrationDecisionBlocker[],
	migrationDatabase?: MigrationDatabase,
): Promise<LegacyScimAccountRecord[]> {
	if (!state.scimProvider || !options.scim) return [];
	const { accounts, accountTable } = await readScimAccountsFrom16(
		config,
		state,
		migrationDatabase,
	);
	const requestedAccountIds = new Set(options.scim.accountIdsToRetire);
	const activeAccountIds = new Set(accounts.map((account) => account.id));
	const missingAccountIds = accounts
		.filter((account) => !requestedAccountIds.has(account.id))
		.map((account) => account.id)
		.sort();
	const unknownAccountIds = state.scimProvider.sourceTableNeedsRename
		? [...requestedAccountIds]
				.filter((accountId) => !activeAccountIds.has(accountId))
				.sort()
		: [];
	if (missingAccountIds.length > 0 || unknownAccountIds.length > 0) {
		reportMigrationDecisionBlocker(blockers, {
			code: "scim-inventory-mismatch",
			missingAccountIds,
			table: accountTable,
			unknownAccountIds,
		});
		return [];
	}
	return [...accounts];
}

/**
 * Inspects a 1.6 database without changing data or schema, and returns every
 * unresolved release-data decision, sorted by blocker code.
 *
 * Throws when the 1.6 data cannot be read at all.
 */
export async function validateMigrationFrom16(
	config: BetterAuthOptions,
	options: MigrateFrom16Options,
): Promise<MigrationDecisionBlocker[]> {
	const blockers: MigrationDecisionBlocker[] = [];
	const state = await inspectLegacyReleaseDataFrom16(config, options, blockers);
	await inspectAccountIdentityFrom16(config, options, undefined, blockers);
	await prepareOAuthProviderDataFrom16(config, options, state, blockers);
	await inspectScimAccountsFrom16(config, options, state, blockers);
	return blockers.sort(
		(left, right) =>
			left.code.localeCompare(right.code) ||
			getMigrationDecisionBlockerKey(left).localeCompare(
				getMigrationDecisionBlockerKey(right),
			),
	);
}

export async function retireScimAccountsFrom16(
	config: BetterAuthOptions,
	options: MigrateFrom16Options,
	state: LegacyReleaseDataState,
	inspectedAccounts?: readonly LegacyScimAccountRecord[],
	migrationDatabase?: MigrationDatabase,
): Promise<LegacyScimAccountRow[]> {
	if (!state.scimProvider || !options.scim) return [];
	const database = migrationDatabase ?? (await getMigrationDatabase(config));
	const accounts = await inspectScimAccountsFrom16(
		config,
		options,
		state,
		undefined,
		database,
	);
	const freshAccountIds = new Set(accounts.map((account) => account.id));
	if (
		inspectedAccounts &&
		(inspectedAccounts.length !== freshAccountIds.size ||
			inspectedAccounts.some((account) => !freshAccountIds.has(account.id)))
	) {
		throw new BetterAuthError(
			"The SCIM account retirement inventory changed after it was reviewed. Run the migration plan again.",
		);
	}
	if (accounts.length === 0) return [];
	if (database.databaseType === "mysql" && !database.inTransaction) {
		if (!database.transaction) {
			throw new BetterAuthError(
				`The ${database.adapterId} adapter must expose a transaction-scoped migration connection before Better Auth can safely retire populated 1.6 SCIM accounts on MySQL.`,
			);
		}
		return database.transaction((transaction) =>
			retireScimAccountsFrom16(config, options, state, accounts, transaction),
		);
	}
	const { kysely } = database;
	const accountSchema = database.authTables.account;
	if (!accountSchema) return [];
	const accountTable = accountSchema.modelName || "account";
	const idColumn = accountSchema.fields.id?.fieldName || "id";
	await sql`
		DELETE FROM ${sql.table(accountTable)}
		WHERE ${sql.ref(idColumn)} IN (${sql.join(accounts.map((account) => account.id))})
	`.execute(kysely);
	// The upgrade requires a maintenance window with every SCIM and account
	// writer stopped. Recheck here so an in-flight write that crossed the
	// shutdown boundary blocks the migration before it can continue.
	const { accounts: remainingAccounts } = await readScimAccountsFrom16(
		config,
		state,
		database,
	);
	if (remainingAccounts.length > 0) {
		reportMigrationDecisionBlocker(undefined, {
			code: "scim-inventory-mismatch",
			missingAccountIds: remainingAccounts.map((account) => account.id).sort(),
			table: accountTable,
			unknownAccountIds: [],
		});
	}
	return accounts.map(({ providerAccountId, providerId, userId }) => ({
		providerAccountId,
		providerId,
		userId,
	}));
}

export function summarizeScimMigration(
	state: LegacyReleaseDataState,
	identities: LegacyScimAccountRow[] = [],
): MigratedScimSummary | undefined {
	if (!state.scimProvider) return undefined;
	return {
		backupTable: state.scimProvider.backupTable,
		identities,
		reprovisionRequired: state.scimProvider.rowCount > 0,
		retiredProviders: state.scimProvider.rowCount,
	};
}

function requireSqliteColumn(createTableSql: string, columnName: string) {
	const escapedColumnName = columnName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const columnDefinition = new RegExp(
		`((?:"${escapedColumnName}"|\`${escapedColumnName}\`|\\[${escapedColumnName}\\])\\s+[^,]+?)(?=,|\\s*\\)\\s*$)`,
		"i",
	);
	const match = createTableSql.match(columnDefinition);
	if (!match?.[1]) {
		throw new BetterAuthError(
			`SQLite could not find column "${columnName}" while rebuilding the account table.`,
		);
	}
	if (/\bNOT\s+NULL\b/i.test(match[1])) return createTableSql;
	return createTableSql.replace(columnDefinition, `${match[1]} NOT NULL`);
}

async function requireSqliteAccountIssuerColumn({
	accountTable,
	columns,
	issuerColumn,
	inTransaction,
	kysely,
}: {
	accountTable: string;
	columns: readonly string[];
	issuerColumn: string;
	inTransaction: boolean;
	kysely: Kysely<unknown>;
}) {
	const tableDefinition = await sql<{ sql: string | null }>`
		SELECT sql
		FROM sqlite_master
		WHERE type = 'table' AND name = ${accountTable}
	`.execute(kysely);
	const createTableSql = tableDefinition.rows[0]?.sql;
	if (!createTableSql) {
		throw new BetterAuthError(
			`SQLite could not read the schema for account table "${accountTable}".`,
		);
	}
	const dependentSchemaDefinitions = await sql<{ sql: string | null }>`
		SELECT sql
		FROM sqlite_master
		WHERE
			type IN ('index', 'trigger') AND
			tbl_name = ${accountTable} AND
			sql IS NOT NULL
		ORDER BY type, name
	`.execute(kysely);
	const temporaryTable = `${accountTable}__better_auth_1_7`;
	const temporaryTableExists = await sql`
		SELECT 1
		FROM sqlite_master
		WHERE type = 'table' AND name = ${temporaryTable}
		LIMIT 1
	`.execute(kysely);
	if (temporaryTableExists.rows.length > 0) {
		throw new BetterAuthError(
			`SQLite temporary migration table "${temporaryTable}" already exists.`,
		);
	}

	const hardenedCreateTableSql = requireSqliteColumn(
		createTableSql,
		issuerColumn,
	);
	const createTemporaryTableSql = hardenedCreateTableSql.replace(
		/^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"(?:[^"]|"")*"|`[^`]*`|\[[^\]]*\]|\S+)/i,
		`CREATE TABLE "${temporaryTable.replaceAll('"', '""')}"`,
	);
	if (createTemporaryTableSql === hardenedCreateTableSql) {
		throw new BetterAuthError(
			`SQLite could not rewrite the account table "${accountTable}".`,
		);
	}

	const rebuildAccountTable = async () => {
		await sql.raw(createTemporaryTableSql).execute(kysely);
		const columnReferences = columns.map((column) => sql.ref(column));
		await sql`
			INSERT INTO ${sql.table(temporaryTable)}
				(${sql.join(columnReferences)})
			SELECT ${sql.join(columnReferences)}
			FROM ${sql.table(accountTable)}
		`.execute(kysely);
		await kysely.schema.dropTable(accountTable).execute();
		await kysely.schema
			.alterTable(temporaryTable)
			.renameTo(accountTable)
			.execute();
		for (const definition of dependentSchemaDefinitions.rows) {
			if (definition.sql) await sql.raw(definition.sql).execute(kysely);
		}
		const foreignKeyViolations = await sql`PRAGMA foreign_key_check`.execute(
			kysely,
		);
		if (foreignKeyViolations.rows.length > 0) {
			throw new BetterAuthError(
				`SQLite found foreign key violations while rebuilding account table "${accountTable}".`,
			);
		}
	};
	if (inTransaction) {
		await sql`PRAGMA defer_foreign_keys = ON`.execute(kysely);
		await rebuildAccountTable();
		return;
	}

	const foreignKeys = await sql<{ foreign_keys: number }>`
		PRAGMA foreign_keys
	`.execute(kysely);
	const foreignKeysEnabled = Boolean(foreignKeys.rows[0]?.foreign_keys);
	if (foreignKeysEnabled) {
		await sql`PRAGMA foreign_keys = OFF`.execute(kysely);
	}
	try {
		await sql`BEGIN IMMEDIATE`.execute(kysely);
		try {
			await rebuildAccountTable();
			await sql`COMMIT`.execute(kysely);
		} catch (error) {
			await sql`ROLLBACK`.execute(kysely);
			throw error;
		}
	} finally {
		if (foreignKeysEnabled) {
			await sql`PRAGMA foreign_keys = ON`.execute(kysely);
		}
	}
}

async function inspectAccountIdentityFrom16(
	config: BetterAuthOptions,
	options: MigrateFrom16Options,
	migrationDatabase?: MigrationDatabase,
	blockers?: MigrationDecisionBlocker[],
) {
	const database = migrationDatabase ?? (await getMigrationDatabase(config));
	const { authTables, kysely } = database;
	const accountSchema = authTables.account;
	if (!accountSchema) return undefined;
	const accountTable = accountSchema.modelName || "account";
	const resolvedAccountSchema =
		getSchemaFromAuthTables(authTables)[accountTable];
	if (!resolvedAccountSchema) {
		throw new BetterAuthError(
			`The configured account schema "${accountTable}" could not be resolved.`,
		);
	}
	const issuerColumn = accountSchema.fields.issuer?.fieldName || "issuer";
	const idColumn = accountSchema.fields.id?.fieldName || "id";
	const accountIdColumn =
		accountSchema.fields.accountId?.fieldName || "accountId";
	const providerIdColumn =
		accountSchema.fields.providerId?.fieldName || "providerId";
	const accountTableMetadata = (await kysely.introspection.getTables()).find(
		(table) => table.name === accountTable,
	);
	if (!accountTableMetadata) return undefined;
	const existingColumns = new Set(
		accountTableMetadata.columns.map((column) => column.name),
	);
	if (!existingColumns.has(accountIdColumn)) return undefined;
	const accountIdentities = await sql<LegacyAccountIdentityRow>`
		SELECT
			${sql.ref(idColumn)} AS "id",
			${sql.ref(accountIdColumn)} AS "providerAccountId",
			${existingColumns.has(issuerColumn) ? sql.ref(issuerColumn) : sql`NULL`} AS "issuer",
			${sql.ref(providerIdColumn)} AS "providerId"
		FROM ${sql.table(accountTable)}
	`.execute(kysely);
	const accountsWithoutIssuer = accountIdentities.rows.filter(
		(account) => !readStoredIssuer(account.issuer),
	);
	// A fully populated issuer column is already a 1.7 database. The release
	// migration owns only the 1.6 account shape, where every row lacks issuer.
	if (accountsWithoutIssuer.length === 0) return undefined;
	if (config.account?.identityStrategy === undefined) {
		reportMigrationDecisionBlocker(blockers, {
			accountCount: accountsWithoutIssuer.length,
			code: "account-identity-strategy-required",
			providerIds: [
				...new Set(accountsWithoutIssuer.map((account) => account.providerId)),
			].sort(),
			table: accountTable,
		});
		return undefined;
	}
	if (config.account.identityStrategy === "issuer") {
		reportMigrationDecisionBlocker(blockers, {
			accountCount: accountsWithoutIssuer.length,
			code: "account-identity-strategy-unsupported",
			providerIds: [
				...new Set(accountsWithoutIssuer.map((account) => account.providerId)),
			].sort(),
			table: accountTable,
		});
		return undefined;
	}
	const providerNamespaces: Record<string, string> = {};

	const providerInventory = await sql<AccountProviderCount>`
		SELECT
			${sql.ref(providerIdColumn)} AS "providerId",
			COUNT(*) AS "count"
		FROM ${sql.table(accountTable)}
		GROUP BY ${sql.ref(providerIdColumn)}
	`.execute(kysely);
	const populatedProviders: Record<string, number> = {};
	for (const row of providerInventory.rows) {
		populatedProviders[row.providerId] = toSafeRowCount(row.count);
	}
	for (const providerId of Object.keys(populatedProviders)) {
		providerNamespaces[providerId] = createProviderScopedMigrationIssuer(
			providerId,
			providerId === "credential" || providerId === "siwe"
				? "local"
				: "external",
		);
	}
	const projectedIdentities = new Map<string, string>();
	const reportedCollisions = new Set<string>();
	for (const account of accountIdentities.rows) {
		const storedIssuer = readStoredIssuer(account.issuer);
		const requiredIssuer = providerNamespaces[account.providerId];
		if (storedIssuer && requiredIssuer && storedIssuer !== requiredIssuer) {
			reportMigrationDecisionBlocker(blockers, {
				accountId: account.id,
				code: "account-issuer-conflict",
				requestedIssuer: requiredIssuer,
				storedIssuer,
				table: accountTable,
			});
		}
		const issuer = requiredIssuer ?? storedIssuer;
		if (issuer === null || issuer === undefined) continue;
		const identityKey = JSON.stringify([issuer, account.providerAccountId]);
		const existingProviderId = projectedIdentities.get(identityKey);
		if (existingProviderId) {
			if (!reportedCollisions.has(identityKey)) {
				reportedCollisions.add(identityKey);
				reportMigrationDecisionBlocker(blockers, {
					code: "account-identity-collision",
					issuer,
					providerAccountId: account.providerAccountId,
					providerIds: [existingProviderId, account.providerId]
						.filter(
							(providerId, index, providerIds) =>
								providerIds.indexOf(providerId) === index,
						)
						.sort(),
					table: accountTable,
				});
			}
			continue;
		}
		projectedIdentities.set(identityKey, account.providerId);
	}
	return {
		accountIdColumn,
		accountTable,
		accountTableMetadata,
		existingColumns,
		idColumn,
		issuerColumn,
		providerIdColumn,
		providerNamespaces,
		resolvedAccountSchema,
	};
}

/**
 * A row still needs the issuer backfill when its issuer is null or empty. MySQL's default
 * `sql_mode` accepts a required column with no default and writes an empty
 * string into every existing row, so an empty issuer is corrupted data that
 * still needs the backfill, not a value.
 */
function unresolvedIssuerPredicate(issuerColumn: string) {
	return sql`(${sql.ref(issuerColumn)} IS NULL OR ${sql.ref(issuerColumn)} = '')`;
}

function readStoredIssuer(issuer: string | null | undefined) {
	return issuer?.trim() || undefined;
}

async function countCorruptedAccountIssuers(
	kysely: Kysely<unknown>,
	accountTable: string,
	issuerColumn: string,
) {
	const corrupted = await sql<{ count: bigint | number | string }>`
		SELECT COUNT(*) AS "count"
		FROM ${sql.table(accountTable)}
		WHERE ${sql.ref(issuerColumn)} = ''
	`.execute(kysely);
	return toSafeRowCount(corrupted.rows[0]?.count ?? 0);
}

async function accountIndexExists({
	accountTable,
	databaseType,
	indexName,
	kysely,
}: {
	accountTable: string;
	databaseType: "mssql" | "mysql" | "postgres" | "sqlite";
	indexName: string;
	kysely: Kysely<unknown>;
}) {
	const existing =
		databaseType === "mysql"
			? await sql<{ name: string }>`
				SELECT INDEX_NAME AS "name"
				FROM information_schema.statistics
				WHERE
					TABLE_SCHEMA = DATABASE() AND
					TABLE_NAME = ${accountTable} AND
					INDEX_NAME = ${indexName}
			`.execute(kysely)
			: databaseType === "postgres"
				? await sql<{ name: string }>`
					SELECT indexname AS "name"
					FROM pg_indexes
					WHERE
						schemaname = current_schema() AND
						tablename = ${accountTable} AND
						indexname = ${indexName}
				`.execute(kysely)
				: databaseType === "mssql"
					? await sql<{ name: string }>`
						SELECT name AS "name"
						FROM sys.indexes
						WHERE
							object_id = OBJECT_ID(${accountTable}) AND
							name = ${indexName}
					`.execute(kysely)
					: await sql<{ name: string }>`
						SELECT name AS "name"
						FROM sqlite_master
						WHERE type = 'index' AND name = ${indexName}
					`.execute(kysely);
	return existing.rows.length > 0;
}

export async function migrateAccountIdentityFrom16(
	config: BetterAuthOptions,
	options: MigrateFrom16Options,
	migrationDatabase?: MigrationDatabase,
): Promise<MigratedAccountSummary> {
	const { databaseType, inTransaction, kysely } =
		migrationDatabase ?? (await getMigrationDatabase(config));
	if (
		databaseType !== "postgres" &&
		databaseType !== "mysql" &&
		databaseType !== "mssql" &&
		databaseType !== "sqlite"
	) {
		throw new BetterAuthError(
			`The 1.6 account data migration is not implemented for ${databaseType}.`,
		);
	}

	const inspection = await inspectAccountIdentityFrom16(
		config,
		options,
		migrationDatabase,
	);
	if (!inspection) return { migrated: 0, providers: {} };
	const {
		accountIdColumn,
		accountTable,
		accountTableMetadata,
		existingColumns,
		issuerColumn,
		providerIdColumn,
		providerNamespaces,
		resolvedAccountSchema,
	} = inspection;
	const identityColumnType = (columnName: "accountId" | "issuer") => {
		if (databaseType === "postgres" || databaseType === "sqlite") {
			return sql`text`;
		}
		const indexLength = getDatabaseIndexStringLength({
			columnName,
			dialect: databaseType,
			fields: resolvedAccountSchema.fields,
			indexes: resolvedAccountSchema.indexes ?? [],
		});
		return sql.raw(`varchar(${indexLength ?? 255})`);
	};

	if (!existingColumns.has(issuerColumn)) {
		await kysely.schema
			.alterTable(accountTable)
			.addColumn(issuerColumn, identityColumnType("issuer"))
			.execute();
	}

	const unresolvedProviderCounts = await sql<AccountProviderCount>`
		SELECT
			${sql.ref(providerIdColumn)} AS "providerId",
			COUNT(*) AS "count"
		FROM ${sql.table(accountTable)}
		WHERE ${unresolvedIssuerPredicate(issuerColumn)}
		GROUP BY ${sql.ref(providerIdColumn)}
	`.execute(kysely);
	const providers: Record<string, number> = {};
	for (const row of unresolvedProviderCounts.rows) {
		providers[row.providerId] = toSafeRowCount(row.count);
	}

	// An index built over empty issuers groups every corrupted row under one
	// key, so re-backfilling real issuers through it fails on duplicate keys.
	const identityIndex = (resolvedAccountSchema.indexes ?? []).find(
		(index) =>
			index.unique === true &&
			index.columns.length === 2 &&
			index.columns.includes(issuerColumn) &&
			index.columns.includes(accountIdColumn),
	);
	if (
		identityIndex &&
		(await countCorruptedAccountIssuers(kysely, accountTable, issuerColumn)) >
			0 &&
		(await accountIndexExists({
			accountTable,
			databaseType,
			indexName: identityIndex.name,
			kysely,
		}))
	) {
		const dropIndex = kysely.schema.dropIndex(identityIndex.name);
		if (databaseType === "mysql" || databaseType === "mssql") {
			await dropIndex.on(accountTable).execute();
		} else {
			await dropIndex.execute();
		}
	}

	for (const [providerId, issuer] of Object.entries(providerNamespaces)) {
		if (!providers[providerId]) continue;
		await sql`
			UPDATE ${sql.table(accountTable)}
			SET ${sql.ref(issuerColumn)} = ${issuer}
			WHERE
				${sql.ref(providerIdColumn)} = ${providerId} AND
				${unresolvedIssuerPredicate(issuerColumn)}
		`.execute(kysely);
	}
	const unresolvedAccount =
		databaseType === "mssql"
			? await sql`
				SELECT TOP 1 1
				FROM ${sql.table(accountTable)}
				WHERE ${unresolvedIssuerPredicate(issuerColumn)}
			`.execute(kysely)
			: await sql`
				SELECT 1
				FROM ${sql.table(accountTable)}
				WHERE ${unresolvedIssuerPredicate(issuerColumn)}
				LIMIT 1
			`.execute(kysely);
	if (unresolvedAccount.rows.length > 0) {
		throw new BetterAuthError(
			"The 1.6 account migration left unresolved account identities.",
		);
	}

	const duplicateAccount =
		databaseType === "mssql"
			? await sql`
				SELECT TOP 1 1
				FROM ${sql.table(accountTable)}
				GROUP BY
					${sql.ref(issuerColumn)},
					${sql.ref(accountIdColumn)}
				HAVING COUNT(*) > 1
			`.execute(kysely)
			: await sql`
				SELECT 1
				FROM ${sql.table(accountTable)}
				GROUP BY
					${sql.ref(issuerColumn)},
					${sql.ref(accountIdColumn)}
				HAVING COUNT(*) > 1
				LIMIT 1
			`.execute(kysely);
	if (duplicateAccount.rows.length > 0) {
		throw new BetterAuthError(
			"The 1.6 account migration found duplicate issuer and provider-account identities.",
		);
	}

	if (databaseType === "postgres") {
		await sql`
			ALTER TABLE ${sql.table(accountTable)}
			ALTER COLUMN ${sql.ref(issuerColumn)} SET NOT NULL
		`.execute(kysely);
	} else if (databaseType === "mysql") {
		await sql`
			ALTER TABLE ${sql.table(accountTable)}
			MODIFY COLUMN ${sql.ref(issuerColumn)}
			${identityColumnType("issuer")} NOT NULL
		`.execute(kysely);
		await sql`
			ALTER TABLE ${sql.table(accountTable)}
			MODIFY COLUMN ${sql.ref(accountIdColumn)}
			${identityColumnType("accountId")} NOT NULL
		`.execute(kysely);
	} else if (databaseType === "mssql") {
		await sql`
			ALTER TABLE ${sql.table(accountTable)}
			ALTER COLUMN ${sql.ref(issuerColumn)}
			${identityColumnType("issuer")} NOT NULL
		`.execute(kysely);
		await sql`
			ALTER TABLE ${sql.table(accountTable)}
			ALTER COLUMN ${sql.ref(accountIdColumn)}
			${identityColumnType("accountId")} NOT NULL
		`.execute(kysely);
	} else {
		await requireSqliteAccountIssuerColumn({
			accountTable,
			columns: accountTableMetadata.columns
				.map((column) => column.name)
				.concat(existingColumns.has(issuerColumn) ? [] : [issuerColumn]),
			issuerColumn,
			inTransaction,
			kysely,
		});
	}

	return {
		migrated: Object.values(providers).reduce(
			(total, count) => total + count,
			0,
		),
		providers,
	};
}

export async function findReleaseMigrationBlockers({
	authTables,
	existingTables,
	legacyTableNames,
	tableContainsRows,
}: ReleaseMigrationInspection): Promise<ReleaseMigrationBlocker[]> {
	const blockers: ReleaseMigrationBlocker[] = [];
	const oauthClientSchema = authTables.oauthClient;
	const retiredOAuthApplicationName =
		legacyTableNames?.oauthApplication || "oauthApplication";
	const retiredOAuthApplication = existingTables.find(
		(table) => table.name === retiredOAuthApplicationName,
	);
	if (
		oauthClientSchema &&
		retiredOAuthApplication &&
		(await tableContainsRows(retiredOAuthApplication.name))
	) {
		blockers.push({
			code: "table-data-move",
			migration: "1.7-provider-client-store",
			sourceTable: retiredOAuthApplication.name,
			targetTable: oauthClientSchema.modelName || "oauthClient",
		});
	}
	const retiredOAuthAccessTokenName =
		legacyTableNames?.oauthAccessToken || "oauthAccessToken";
	const retiredOAuthAccessToken = existingTables.find(
		(table) => table.name === retiredOAuthAccessTokenName,
	);
	const hasLegacyAccessTokenShape =
		retiredOAuthAccessToken?.columns.some(
			(column) => column.name === "accessToken",
		) &&
		!retiredOAuthAccessToken.columns.some((column) => column.name === "token");
	if (
		authTables.oauthAccessToken &&
		retiredOAuthAccessToken &&
		hasLegacyAccessTokenShape &&
		(await tableContainsRows(retiredOAuthAccessToken.name))
	) {
		blockers.push({
			code: "retired-table-data",
			migration: "1.7-provider-token-store",
			table: retiredOAuthAccessToken.name,
		});
	}

	const retiredOAuthConsentName =
		legacyTableNames?.oauthConsent || "oauthConsent";
	const retiredOAuthConsent = existingTables.find(
		(table) => table.name === retiredOAuthConsentName,
	);
	const hasLegacyConsentShape =
		retiredOAuthConsent?.columns.some(
			(column) => column.name === "consentGiven",
		) &&
		!retiredOAuthConsent.columns.some(
			(column) => column.name === "requestedUserInfoClaims",
		);
	if (
		authTables.oauthConsent &&
		retiredOAuthConsent &&
		hasLegacyConsentShape &&
		(await tableContainsRows(retiredOAuthConsent.name))
	) {
		blockers.push({
			code: "table-data-conversion",
			conversion: "space-delimited-string-to-string-array",
			migration: "1.7-provider-consent-store",
			sourceTable: retiredOAuthConsent.name,
			targetTable: authTables.oauthConsent.modelName || "oauthConsent",
		});
	}

	const scimReplacementSchemas = [
		authTables.scimConnectionBinding,
		authTables.scimIdentityTombstone,
		authTables.scimSubject,
		authTables.scimUser,
		authTables.scimProjectionGrant,
		authTables.scimGroup,
		authTables.scimGroupMember,
	];
	const retiredScimProviderName =
		legacyTableNames?.scimProvider || "scimProvider";
	const retiredScimProvider = existingTables.find(
		(table) => table.name === retiredScimProviderName,
	);
	if (
		scimReplacementSchemas.every((schema) => schema !== undefined) &&
		retiredScimProvider &&
		(await tableContainsRows(retiredScimProvider.name))
	) {
		blockers.push({
			code: "reprovision-data",
			migration: "1.7-scim",
			sourceTables: [retiredScimProvider.name],
			targetTables: [
				authTables.scimConnectionBinding?.modelName || "scimConnectionBinding",
				authTables.scimIdentityTombstone?.modelName || "scimIdentityTombstone",
				authTables.scimSubject?.modelName || "scimSubject",
				authTables.scimUser?.modelName || "scimUser",
				authTables.scimProjectionGrant?.modelName || "scimProjectionGrant",
				authTables.scimGroup?.modelName || "scimGroup",
				authTables.scimGroupMember?.modelName || "scimGroupMember",
			],
		});
	}

	return blockers;
}
