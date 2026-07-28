import type { BetterAuthOptions } from "@better-auth/core";
import { getAuthTables } from "@better-auth/core/db";
import { getDatabaseIndexStringLength } from "@better-auth/core/db/internal";
import { BetterAuthError } from "@better-auth/core/error";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { getAdapter } from "./adapter-kysely";
import { getSchema } from "./get-schema";
import type { MigrationDatabase } from "./migration-database";
import { getMigrationDatabase } from "./migration-database";

// cspell:ignore conindid indexrelid

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

export type ReleaseMigrationBlocker =
	| TableDataMoveBlocker
	| ReprovisionDataBlocker
	| RetiredTableDataBlocker
	| TableDataConversionBlocker;

export interface MigrateFrom16Options {
	/**
	 * Stable 1.7 issuer for every populated 1.6 account provider.
	 *
	 * Credential accounts use `local:credential`. OAuth providers without a
	 * provider-declared issuer use `local:oauth:<encoded-provider-id>`.
	 */
	accountIssuers: Record<string, string>;
	/** Physical names used by customized 1.6 plugin schemas. */
	legacyTableNames?: {
		oauthAccessToken?: string | undefined;
		oauthApplication?: string | undefined;
		oauthConsent?: string | undefined;
		scimProvider?: string | undefined;
	};
	/** Explicit policy for data owned by the retired 1.6 OIDC provider. */
	oauthProvider?: {
		clients: "migrate";
		clientSecrets: "rehash-plaintext";
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
	authTables: ReturnType<typeof getAuthTables>;
	existingTables: readonly {
		columns: readonly { name: string }[];
		name: string;
	}[];
	legacyTableNames?: {
		oauthAccessToken?: string | undefined;
		oauthApplication?: string | undefined;
		oauthConsent?: string | undefined;
		scimProvider?: string | undefined;
	};
	tableContainsRows: (table: string) => Promise<boolean>;
}

interface AccountProviderCount {
	count: bigint | number | string;
	providerId: string;
}

interface LegacyAccountIdentityRow {
	issuer?: string | null | undefined;
	legacyAccountId: string;
	providerAccountId?: string | null | undefined;
	providerId: string;
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

function getLegacyBackupTableName(sourceTable: string) {
	const backupTable = `${sourceTable}__better_auth_1_6`;
	if (new TextEncoder().encode(backupTable).length > 63) {
		throw new BetterAuthError(
			`The automatic backup table name for "${sourceTable}" exceeds the portable 63-byte identifier limit. Configure a shorter legacy table name before migrating.`,
		);
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

async function inspectLegacyTable({
	kysely,
	legacyColumns,
	sourceTable,
}: {
	kysely: Kysely<unknown>;
	legacyColumns: readonly string[];
	sourceTable: string;
}): Promise<LegacyTableState | undefined> {
	const tables = await kysely.introspection.getTables();
	const source = tables.find((table) => table.name === sourceTable);
	const backupTable = getLegacyBackupTableName(sourceTable);
	const backup = tables.find((table) => table.name === backupTable);
	const hasLegacyShape = (table: (typeof tables)[number] | undefined) =>
		Boolean(
			table &&
				legacyColumns.every((column) =>
					table.columns.some((candidate) => candidate.name === column),
				),
		);
	const sourceHasLegacyShape = hasLegacyShape(source);
	const backupHasLegacyShape = hasLegacyShape(backup);

	if (sourceHasLegacyShape && backup) {
		throw new BetterAuthError(
			`Cannot retire legacy table "${sourceTable}" because backup table "${backupTable}" already exists.`,
		);
	}
	if (backup && !backupHasLegacyShape) {
		throw new BetterAuthError(
			`Backup table "${backupTable}" does not have the expected 1.6 schema.`,
		);
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

export interface LegacyReleaseDataState {
	oauthAccessToken?: LegacyTableState | undefined;
	oauthApplication?: LegacyTableState | undefined;
	oauthConsent?: LegacyTableState | undefined;
	scimProvider?: LegacyTableState | undefined;
}

export async function inspectLegacyReleaseDataFrom16(
	config: BetterAuthOptions,
	options: MigrateFrom16Options,
): Promise<LegacyReleaseDataState> {
	const { kysely } = await getMigrationDatabase(config);
	const authTables = getAuthTables(config);
	const legacyTableNames = options.legacyTableNames;
	const state: LegacyReleaseDataState = {
		oauthApplication: authTables.oauthClient
			? await inspectLegacyTable({
					kysely,
					legacyColumns: ["clientId", "redirectUrls"],
					sourceTable: legacyTableNames?.oauthApplication || "oauthApplication",
				})
			: undefined,
		oauthAccessToken: authTables.oauthAccessToken
			? await inspectLegacyTable({
					kysely,
					legacyColumns: ["accessToken", "refreshToken"],
					sourceTable: legacyTableNames?.oauthAccessToken || "oauthAccessToken",
				})
			: undefined,
		oauthConsent: authTables.oauthConsent
			? await inspectLegacyTable({
					kysely,
					legacyColumns: ["consentGiven", "scopes"],
					sourceTable: legacyTableNames?.oauthConsent || "oauthConsent",
				})
			: undefined,
		scimProvider: authTables.scimConnectionBinding
			? await inspectLegacyTable({
					kysely,
					legacyColumns: ["providerId"],
					sourceTable: legacyTableNames?.scimProvider || "scimProvider",
				})
			: undefined,
	};

	if (
		state.oauthApplication?.rowCount &&
		(options.oauthProvider?.clients !== "migrate" ||
			options.oauthProvider.clientSecrets !== "rehash-plaintext")
	) {
		throw new BetterAuthError(
			'The 1.6 OAuth client migration requires clients: "migrate" and clientSecrets: "rehash-plaintext".',
		);
	}
	if (
		state.oauthAccessToken?.rowCount &&
		options.oauthProvider?.tokens !== "revoke"
	) {
		throw new BetterAuthError(
			'The 1.6 OAuth token migration requires tokens: "revoke".',
		);
	}
	if (state.oauthConsent?.rowCount && !options.oauthProvider?.consents) {
		throw new BetterAuthError(
			'The 1.6 OAuth consent migration requires consents: "migrate" or "reauthorize".',
		);
	}
	if (
		state.scimProvider?.rowCount &&
		(options.scim?.providers !== "reprovision" ||
			!Array.isArray(options.scim.accountIdsToRetire))
	) {
		throw new BetterAuthError(
			'The 1.6 SCIM migration requires providers: "reprovision" and an explicit accountIdsToRetire inventory.',
		);
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
): Promise<OAuthProviderDataFrom16Plan | undefined> {
	if (
		!state.oauthApplication &&
		!state.oauthAccessToken &&
		!state.oauthConsent
	) {
		return undefined;
	}
	const { kysely } = await getMigrationDatabase(config);
	const adapter = await getAdapter(config);
	const authTables = getAuthTables(config);
	const existingTables = new Set(
		(await kysely.introspection.getTables()).map((table) => table.name),
	);
	const clients: OAuthProviderDataFrom16Plan["clients"] = [];
	if (state.oauthApplication) {
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
				throw new BetterAuthError(
					`OAuth client "${client.clientId}" has no redirect URI and cannot be migrated.`,
				);
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
			if (existing) {
				if (
					JSON.stringify(existing.redirectUris) !== JSON.stringify(redirectUris)
				) {
					throw new BetterAuthError(
						`OAuth client "${client.clientId}" already exists with different redirect URIs.`,
					);
				}
			}
			const isPublic = client.type === "public";
			clients.push({
				alreadyMigrated: Boolean(existing),
				data: {
					clientId: client.clientId,
					clientSecret:
						!isPublic && client.clientSecret
							? await hashLegacyClientSecret(client.clientSecret)
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
			if (existing) {
				if (JSON.stringify(existing.scopes) !== JSON.stringify(scopes)) {
					throw new BetterAuthError(
						`OAuth consent for client "${consent.clientId}" and user "${consent.userId}" already exists with different scopes.`,
					);
				}
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
): Promise<MigratedOAuthProviderSummary | undefined> {
	const plan =
		preparedData ??
		(await prepareOAuthProviderDataFrom16(config, options, state));
	if (!plan) return undefined;
	const adapter = await getAdapter(config);
	for (const client of plan.clients) {
		if (client.alreadyMigrated) continue;
		await adapter.create({
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
			await adapter.create({
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

export async function inspectScimAccountsFrom16(
	config: BetterAuthOptions,
	options: MigrateFrom16Options,
	state: LegacyReleaseDataState,
): Promise<LegacyScimAccountRecord[]> {
	if (!state.scimProvider || !options.scim) return [];
	const { kysely } = await getMigrationDatabase(config);
	const providerTable = state.scimProvider.sourceTableNeedsRename
		? state.scimProvider.sourceTable
		: state.scimProvider.backupTable;
	const providers = await sql<LegacyScimProviderRow>`
		SELECT ${sql.ref("providerId")} AS "providerId"
		FROM ${sql.table(providerTable)}
	`.execute(kysely);
	const providerIds = new Set(providers.rows.map((row) => row.providerId));
	const accountSchema = getAuthTables(config).account;
	if (!accountSchema) return [];
	const accountTable = accountSchema.modelName || "account";
	const idColumn = accountSchema.fields.id?.fieldName || "id";
	const providerIdColumn =
		accountSchema.fields.providerId?.fieldName || "providerId";
	const userIdColumn = accountSchema.fields.userId?.fieldName || "userId";
	const accounts =
		providerIds.size === 0
			? []
			: (
					await sql<LegacyScimAccountRecord>`
						SELECT
							${sql.ref(idColumn)} AS "id",
							${sql.ref("accountId")} AS "providerAccountId",
							${sql.ref(providerIdColumn)} AS "providerId",
							${sql.ref(userIdColumn)} AS "userId"
						FROM ${sql.table(accountTable)}
						WHERE ${sql.ref(providerIdColumn)} IN (${sql.join([...providerIds])})
					`.execute(kysely)
				).rows;
	const requestedAccountIds = new Set(options.scim.accountIdsToRetire);
	const activeAccountIds = new Set(accounts.map((account) => account.id));
	const missingAccount = accounts.find(
		(account) => !requestedAccountIds.has(account.id),
	);
	const unknownAccountId = [...requestedAccountIds].find(
		(accountId) => !activeAccountIds.has(accountId),
	);
	if (
		missingAccount ||
		(state.scimProvider.sourceTableNeedsRename && unknownAccountId)
	) {
		throw new BetterAuthError(
			"The SCIM account retirement inventory must exactly match every account owned by the legacy SCIM providers.",
		);
	}
	return [...accounts];
}

/**
 * Validates every explicit 1.6 release-data decision without changing data or
 * schema. CLI planners use the same validation path as the migration itself.
 */
export async function validateMigrationFrom16(
	config: BetterAuthOptions,
	options: MigrateFrom16Options,
): Promise<void> {
	const state = await inspectLegacyReleaseDataFrom16(config, options);
	await inspectAccountIdentityFrom16(config, options);
	await prepareOAuthProviderDataFrom16(config, options, state);
	await inspectScimAccountsFrom16(config, options, state);
}

export async function retireScimAccountsFrom16(
	config: BetterAuthOptions,
	options: MigrateFrom16Options,
	state: LegacyReleaseDataState,
	inspectedAccounts?: readonly LegacyScimAccountRecord[],
	migrationDatabase?: MigrationDatabase,
): Promise<LegacyScimAccountRow[]> {
	if (!state.scimProvider || !options.scim) return [];
	const accounts =
		inspectedAccounts ??
		(await inspectScimAccountsFrom16(config, options, state));
	if (accounts.length === 0) return [];
	const { kysely } = migrationDatabase ?? (await getMigrationDatabase(config));
	const accountSchema = getAuthTables(config).account;
	if (!accountSchema) return [];
	const accountTable = accountSchema.modelName || "account";
	const idColumn = accountSchema.fields.id?.fieldName || "id";
	await sql`
		DELETE FROM ${sql.table(accountTable)}
		WHERE ${sql.ref(idColumn)} IN (${sql.join(accounts.map((account) => account.id))})
	`.execute(kysely);
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

async function requireSqliteAccountIdentityColumns({
	accountTable,
	columns,
	issuerColumn,
	inTransaction,
	kysely,
	providerAccountIdColumn,
}: {
	accountTable: string;
	columns: readonly string[];
	issuerColumn: string;
	inTransaction: boolean;
	kysely: Kysely<unknown>;
	providerAccountIdColumn: string;
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
		requireSqliteColumn(createTableSql, issuerColumn),
		providerAccountIdColumn,
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
) {
	const { kysely } = migrationDatabase ?? (await getMigrationDatabase(config));
	const accountSchema = getAuthTables(config).account;
	if (!accountSchema) return undefined;
	const accountTable = accountSchema.modelName || "account";
	const resolvedAccountSchema = getSchema(config)[accountTable];
	if (!resolvedAccountSchema) {
		throw new BetterAuthError(
			`The configured account schema "${accountTable}" could not be resolved.`,
		);
	}
	const issuerColumn = accountSchema.fields.issuer?.fieldName || "issuer";
	const providerAccountIdColumn =
		accountSchema.fields.providerAccountId?.fieldName || "providerAccountId";
	const providerIdColumn =
		accountSchema.fields.providerId?.fieldName || "providerId";
	const legacyAccountIdColumn = "accountId";
	const accountTableMetadata = (await kysely.introspection.getTables()).find(
		(table) => table.name === accountTable,
	);
	if (!accountTableMetadata) return undefined;
	const existingColumns = new Set(
		accountTableMetadata.columns.map((column) => column.name),
	);
	if (!existingColumns.has(legacyAccountIdColumn)) return undefined;

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
	const missingIssuerProviders = Object.keys(populatedProviders).filter(
		(providerId) => !options.accountIssuers[providerId]?.trim(),
	);
	if (missingIssuerProviders.length > 0) {
		throw new BetterAuthError(
			`The 1.6 account migration requires an issuer for: ${missingIssuerProviders.sort().join(", ")}.`,
		);
	}

	const accountIdentities = await sql<LegacyAccountIdentityRow>`
		SELECT
			${existingColumns.has(issuerColumn) ? sql.ref(issuerColumn) : sql`NULL`} AS "issuer",
			${sql.ref(legacyAccountIdColumn)} AS "legacyAccountId",
			${
				existingColumns.has(providerAccountIdColumn)
					? sql.ref(providerAccountIdColumn)
					: sql`NULL`
			} AS "providerAccountId",
			${sql.ref(providerIdColumn)} AS "providerId"
		FROM ${sql.table(accountTable)}
	`.execute(kysely);
	const projectedIdentities = new Set<string>();
	for (const account of accountIdentities.rows) {
		const unresolved =
			account.issuer === null ||
			account.issuer === undefined ||
			account.providerAccountId === null ||
			account.providerAccountId === undefined;
		const issuer = unresolved
			? options.accountIssuers[account.providerId]?.trim()
			: account.issuer;
		const providerAccountId = unresolved
			? account.legacyAccountId
			: account.providerAccountId;
		const identityKey = JSON.stringify([issuer, providerAccountId]);
		if (projectedIdentities.has(identityKey)) {
			throw new BetterAuthError(
				"The 1.6 account migration found duplicate issuer and provider-account identities.",
			);
		}
		projectedIdentities.add(identityKey);
	}
	return {
		accountTable,
		accountTableMetadata,
		existingColumns,
		issuerColumn,
		legacyAccountIdColumn,
		providerAccountIdColumn,
		providerIdColumn,
		resolvedAccountSchema,
	};
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
		accountTable,
		accountTableMetadata,
		existingColumns,
		issuerColumn,
		legacyAccountIdColumn,
		providerAccountIdColumn,
		providerIdColumn,
		resolvedAccountSchema,
	} = inspection;
	const getIdentityColumnType = (
		columnName: "issuer" | "providerAccountId",
	) => {
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
			.addColumn(issuerColumn, getIdentityColumnType("issuer"))
			.execute();
	}
	if (!existingColumns.has(providerAccountIdColumn)) {
		await kysely.schema
			.alterTable(accountTable)
			.addColumn(
				providerAccountIdColumn,
				getIdentityColumnType("providerAccountId"),
			)
			.execute();
	}

	const unresolvedProviderCounts = await sql<AccountProviderCount>`
		SELECT
			${sql.ref(providerIdColumn)} AS "providerId",
			COUNT(*) AS "count"
		FROM ${sql.table(accountTable)}
		WHERE
			${sql.ref(issuerColumn)} IS NULL OR
			${sql.ref(providerAccountIdColumn)} IS NULL
		GROUP BY ${sql.ref(providerIdColumn)}
	`.execute(kysely);
	const providers: Record<string, number> = {};
	for (const row of unresolvedProviderCounts.rows) {
		providers[row.providerId] = toSafeRowCount(row.count);
	}

	for (const [providerId, issuer] of Object.entries(options.accountIssuers)) {
		if (!providers[providerId]) continue;
		await sql`
			UPDATE ${sql.table(accountTable)}
			SET
				${sql.ref(issuerColumn)} = ${issuer},
				${sql.ref(providerAccountIdColumn)} = ${sql.ref(legacyAccountIdColumn)}
			WHERE
				${sql.ref(providerIdColumn)} = ${providerId} AND
				(
					${sql.ref(issuerColumn)} IS NULL OR
					${sql.ref(providerAccountIdColumn)} IS NULL
				)
		`.execute(kysely);
	}

	const unresolvedAccount =
		databaseType === "mssql"
			? await sql`
				SELECT TOP 1 1
				FROM ${sql.table(accountTable)}
				WHERE
					${sql.ref(issuerColumn)} IS NULL OR
					${sql.ref(providerAccountIdColumn)} IS NULL
			`.execute(kysely)
			: await sql`
				SELECT 1
				FROM ${sql.table(accountTable)}
				WHERE
					${sql.ref(issuerColumn)} IS NULL OR
					${sql.ref(providerAccountIdColumn)} IS NULL
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
					${sql.ref(providerAccountIdColumn)}
				HAVING COUNT(*) > 1
			`.execute(kysely)
			: await sql`
				SELECT 1
				FROM ${sql.table(accountTable)}
				GROUP BY
					${sql.ref(issuerColumn)},
					${sql.ref(providerAccountIdColumn)}
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
		await sql`
			ALTER TABLE ${sql.table(accountTable)}
			ALTER COLUMN ${sql.ref(providerAccountIdColumn)} SET NOT NULL
		`.execute(kysely);
	} else if (databaseType === "mysql") {
		await sql`
			ALTER TABLE ${sql.table(accountTable)}
			MODIFY COLUMN ${sql.ref(issuerColumn)}
			${getIdentityColumnType("issuer")} NOT NULL
		`.execute(kysely);
		await sql`
			ALTER TABLE ${sql.table(accountTable)}
			MODIFY COLUMN ${sql.ref(providerAccountIdColumn)}
			${getIdentityColumnType("providerAccountId")} NOT NULL
		`.execute(kysely);
	} else if (databaseType === "mssql") {
		await sql`
			ALTER TABLE ${sql.table(accountTable)}
			ALTER COLUMN ${sql.ref(issuerColumn)}
			${getIdentityColumnType("issuer")} NOT NULL
		`.execute(kysely);
		await sql`
			ALTER TABLE ${sql.table(accountTable)}
			ALTER COLUMN ${sql.ref(providerAccountIdColumn)}
			${getIdentityColumnType("providerAccountId")} NOT NULL
		`.execute(kysely);
	} else {
		await requireSqliteAccountIdentityColumns({
			accountTable,
			columns: accountTableMetadata.columns
				.map((column) => column.name)
				.concat(
					existingColumns.has(issuerColumn) ? [] : [issuerColumn],
					existingColumns.has(providerAccountIdColumn)
						? []
						: [providerAccountIdColumn],
				),
			issuerColumn,
			inTransaction,
			kysely,
			providerAccountIdColumn,
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
