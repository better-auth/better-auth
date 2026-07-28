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

interface LegacyScimAccountRow {
	providerAccountId: string;
	providerId: string;
	userId: string;
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
) {
	const { databaseType, kysely } = await getMigrationDatabase(config);
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

export async function migrateOAuthProviderDataFrom16(
	config: BetterAuthOptions,
	options: MigrateFrom16Options,
	state: LegacyReleaseDataState,
): Promise<MigratedOAuthProviderSummary | undefined> {
	if (
		!state.oauthApplication &&
		!state.oauthAccessToken &&
		!state.oauthConsent
	) {
		return undefined;
	}
	const { kysely } = await getMigrationDatabase(config);
	const adapter = await getAdapter(config);
	let migratedClients = 0;
	if (state.oauthApplication) {
		const source = await sql<LegacyOAuthClientRow>`
			SELECT *
			FROM ${sql.table(state.oauthApplication.backupTable)}
		`.execute(kysely);
		for (const client of source.rows) {
			const redirectUris = splitLegacyList(client.redirectUrls, ",");
			if (redirectUris.length === 0) {
				throw new BetterAuthError(
					`OAuth client "${client.clientId}" has no redirect URI and cannot be migrated.`,
				);
			}
			const existing = await adapter.findOne<{
				clientId: string;
				redirectUris: string[];
			}>({
				model: "oauthClient",
				where: [{ field: "clientId", value: client.clientId }],
			});
			if (existing) {
				if (
					JSON.stringify(existing.redirectUris) !== JSON.stringify(redirectUris)
				) {
					throw new BetterAuthError(
						`OAuth client "${client.clientId}" already exists with different redirect URIs.`,
					);
				}
				migratedClients += 1;
				continue;
			}
			const isPublic = client.type === "public";
			await adapter.create({
				model: "oauthClient",
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
			migratedClients += 1;
		}
	}

	let migratedConsents = 0;
	let reauthorizationRequired = 0;
	if (state.oauthConsent) {
		const source = await sql<LegacyOAuthConsentRow>`
			SELECT *
			FROM ${sql.table(state.oauthConsent.backupTable)}
		`.execute(kysely);
		for (const consent of source.rows) {
			if (
				options.oauthProvider?.consents === "reauthorize" ||
				!Boolean(consent.consentGiven)
			) {
				reauthorizationRequired += 1;
				continue;
			}
			const scopes = splitLegacyList(consent.scopes, " ");
			const existing = await adapter.findOne<{
				scopes: string[];
			}>({
				model: "oauthConsent",
				where: [
					{ field: "clientId", value: consent.clientId },
					{ field: "userId", value: consent.userId },
				],
			});
			if (existing) {
				if (JSON.stringify(existing.scopes) !== JSON.stringify(scopes)) {
					throw new BetterAuthError(
						`OAuth consent for client "${consent.clientId}" and user "${consent.userId}" already exists with different scopes.`,
					);
				}
				migratedConsents += 1;
				continue;
			}
			await adapter.create({
				model: "oauthConsent",
				data: {
					clientId: consent.clientId,
					createdAt: consent.createdAt,
					scopes,
					updatedAt: consent.updatedAt,
					userId: consent.userId,
				},
			});
			migratedConsents += 1;
		}
	}

	return {
		clients: {
			backupTable: state.oauthApplication?.backupTable,
			migrated: migratedClients,
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

export async function retireScimAccountsFrom16(
	config: BetterAuthOptions,
	options: MigrateFrom16Options,
	state: LegacyReleaseDataState,
): Promise<LegacyScimAccountRow[]> {
	if (!state.scimProvider || !options.scim) return [];
	const accountIds = [...new Set(options.scim.accountIdsToRetire)];
	if (accountIds.length === 0) return [];
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
	const providerIdColumn =
		accountSchema.fields.providerId?.fieldName || "providerId";
	const userIdColumn = accountSchema.fields.userId?.fieldName || "userId";
	const accounts = await sql<LegacyScimAccountRow>`
		SELECT
			${sql.ref("accountId")} AS "providerAccountId",
			${sql.ref(providerIdColumn)} AS "providerId",
			${sql.ref(userIdColumn)} AS "userId"
		FROM ${sql.table(accountTable)}
		WHERE ${sql.ref("id")} IN (${sql.join(accountIds)})
	`.execute(kysely);
	if (
		accounts.rows.length !== accountIds.length &&
		state.scimProvider.sourceTableNeedsRename
	) {
		throw new BetterAuthError(
			"The SCIM account retirement inventory contains an unknown account id.",
		);
	}
	const unrelatedAccount = accounts.rows.find(
		(account) => !providerIds.has(account.providerId),
	);
	if (unrelatedAccount) {
		throw new BetterAuthError(
			`Account retirement includes provider "${unrelatedAccount.providerId}", which is not present in the legacy SCIM provider inventory.`,
		);
	}
	await sql`
		DELETE FROM ${sql.table(accountTable)}
		WHERE ${sql.ref("id")} IN (${sql.join(accountIds)})
	`.execute(kysely);
	return [...accounts.rows];
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
	kysely,
	providerAccountIdColumn,
}: {
	accountTable: string;
	columns: readonly string[];
	issuerColumn: string;
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

export async function migrateAccountIdentityFrom16(
	config: BetterAuthOptions,
	options: MigrateFrom16Options,
): Promise<MigratedAccountSummary> {
	const { databaseType, kysely } = await getMigrationDatabase(config);
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

	const accountSchema = getAuthTables(config).account;
	if (!accountSchema) {
		return { migrated: 0, providers: {} };
	}
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

	const accountTableMetadata = (await kysely.introspection.getTables()).find(
		(table) => table.name === accountTable,
	);
	if (!accountTableMetadata) {
		return { migrated: 0, providers: {} };
	}
	const existingColumns = new Set(
		accountTableMetadata.columns.map((column) => column.name),
	);
	if (!existingColumns.has(legacyAccountIdColumn)) {
		return { migrated: 0, providers: {} };
	}

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
