import type { BetterAuthOptions } from "@better-auth/core";
import type { DBFieldAttribute, DBFieldType } from "@better-auth/core/db";
import { getAuthTables } from "@better-auth/core/db";
import {
	initGetFieldName,
	initGetModelName,
} from "@better-auth/core/db/adapter";
import type { ResolvedDBTableIndex } from "@better-auth/core/db/internal";
import {
	getDatabaseFieldIndexName,
	getDatabaseIndexStringLength,
	getPortableDatabaseIdentifierKey,
} from "@better-auth/core/db/internal";
import { createLogger } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";
import type { KyselyDatabaseType } from "@better-auth/kysely-adapter";
import { createKyselyAdapter } from "@better-auth/kysely-adapter";
import type {
	AlterTableColumnAlteringBuilder,
	ColumnDataType,
	CreateIndexBuilder,
	CreateTableBuilder,
	Kysely,
	RawBuilder,
} from "kysely";
import { sql } from "kysely";
import { getSchema } from "./get-schema";

// cspell:ignore attnum attrelid indisunique indisvalid indexrelid indnkeyatts ordinality seqno

const postgresMap = {
	string: ["character varying", "varchar", "text", "uuid"],
	number: [
		"int4",
		"integer",
		"bigint",
		"smallint",
		"numeric",
		"real",
		"double precision",
	],
	boolean: ["bool", "boolean"],
	date: ["timestamptz", "timestamp", "date"],
	json: ["json", "jsonb"],
};
const mysqlMap = {
	string: ["varchar", "text", "uuid"],
	number: [
		"integer",
		"int",
		"bigint",
		"smallint",
		"decimal",
		"float",
		"double",
	],
	boolean: ["boolean", "tinyint"],
	date: ["timestamp", "datetime", "date"],
	json: ["json"],
};

const sqliteMap = {
	string: ["TEXT"],
	number: ["INTEGER", "REAL", "BIGINT"],
	boolean: ["INTEGER", "BOOLEAN"], // 0 or 1
	date: ["DATE", "INTEGER"],
	json: ["TEXT"],
};

const mssqlMap = {
	string: ["varchar", "nvarchar", "uniqueidentifier"],
	number: ["int", "bigint", "smallint", "decimal", "float", "double"],
	boolean: ["bit", "smallint"],
	date: ["datetime2", "date", "datetime"],
	json: ["varchar", "nvarchar"],
};

const map = {
	postgres: postgresMap,
	mysql: mysqlMap,
	sqlite: sqliteMap,
	mssql: mssqlMap,
};

interface DatabaseIndexRow {
	columnName?: string;
	column_name?: string;
	COLUMN_NAME?: string | null;
	columnPosition?: number | string;
	column_position?: number | string;
	isDisabled?: boolean | number | string;
	isHypothetical?: boolean | number | string;
	isPartial?: boolean | number | string;
	indexName?: string;
	index_name?: string;
	INDEX_NAME?: string;
	isUnique?: boolean | number | string;
	is_unique?: boolean | number | string;
	isValid?: boolean | number | string;
	keyOrdinal?: number | string;
	key_ordinal?: number | string;
	name?: string;
	nonUnique?: boolean | number | string;
	non_unique?: boolean | number | string;
	NON_UNIQUE?: boolean | number | string;
	ordinality?: number | string;
	prefixLength?: number | string | null;
	seqInIndex?: number | string;
	seq_in_index?: number | string;
	SEQ_IN_INDEX?: number | string;
	seqno?: number | string;
	tableName?: string;
	table_name?: string;
	TABLE_NAME?: string;
	tablename?: string;
	tbl_name?: string;
}

interface DatabaseIndexDefinition {
	columns: readonly string[];
	name: string;
	table: string;
	unique: boolean;
	validFullColumns: boolean;
}

interface DatabaseColumnRow {
	characterMaximumLength?: number | string | null;
	CHARACTER_MAXIMUM_LENGTH?: number | string | null;
	columnName?: string;
	COLUMN_NAME?: string;
	dataType?: string;
	DATA_TYPE?: string;
	maxLength?: number | string;
	tableName?: string;
	TABLE_NAME?: string;
}

interface DatabaseColumnBound {
	maxIndexBytes: number | null;
}

function createDatabaseIndexKey(tableName: string, indexName: string) {
	return `${getPortableDatabaseIdentifierKey(tableName)}\u0000${getPortableDatabaseIdentifierKey(indexName)}`;
}

function createDatabaseColumnKey(tableName: string, columnName: string) {
	return `${tableName}\u0000${columnName}`;
}

function databaseIndexMatches(
	existing: DatabaseIndexDefinition,
	configured: ResolvedDBTableIndex,
) {
	return (
		existing.unique === (configured.unique ?? false) &&
		existing.validFullColumns &&
		existing.columns.length === configured.columns.length &&
		existing.columns.every(
			(column, position) => column === configured.columns[position],
		)
	);
}

function databaseValueIsTrue(value: boolean | number | string | undefined) {
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0;
	return value === "1" || value?.toLowerCase() === "true" || value === "t";
}

async function getDatabaseIndexes(
	db: Kysely<unknown>,
	dbType: KyselyDatabaseType,
	schemaName: string,
) {
	let rows: readonly DatabaseIndexRow[];
	if (dbType === "sqlite") {
		rows = (
			await sql<DatabaseIndexRow>`
				SELECT
					tables.name AS "tableName",
					index_list.name AS "indexName",
					index_info.name AS "columnName",
					index_list."unique" AS "isUnique",
					index_list.partial AS "isPartial",
					index_info.seqno AS "columnPosition"
				FROM sqlite_master AS tables
				INNER JOIN pragma_index_list(tables.name) AS index_list
				INNER JOIN pragma_index_info(index_list.name) AS index_info
				WHERE tables.type = 'table'
			`.execute(db)
		).rows;
	} else if (dbType === "postgres") {
		rows = (
			await sql<DatabaseIndexRow>`
				SELECT
					table_class.relname AS "tableName",
					index_class.relname AS "indexName",
					index_attribute.attname AS "columnName",
					index_data.indisunique AS "isUnique",
					index_data.indisvalid AS "isValid",
					(index_data.indpred IS NOT NULL) AS "isPartial",
					index_column.ordinality AS "columnPosition"
				FROM pg_class AS table_class
				INNER JOIN pg_namespace AS table_namespace
					ON table_namespace.oid = table_class.relnamespace
				INNER JOIN pg_index AS index_data
					ON index_data.indrelid = table_class.oid
				INNER JOIN pg_class AS index_class
					ON index_class.oid = index_data.indexrelid
				INNER JOIN LATERAL unnest(index_data.indkey)
					WITH ORDINALITY AS index_column(attribute_number, ordinality)
					ON TRUE
				LEFT JOIN pg_attribute AS index_attribute
					ON index_attribute.attrelid = table_class.oid
					AND index_attribute.attnum = index_column.attribute_number
				WHERE table_namespace.nspname = ${schemaName}
					AND table_class.relkind = 'r'
					AND index_column.ordinality <= index_data.indnkeyatts
			`.execute(db)
		).rows;
	} else if (dbType === "mysql") {
		rows = (
			await sql<DatabaseIndexRow>`
				SELECT
					table_name AS tableName,
					index_name AS indexName,
					column_name AS columnName,
					non_unique AS nonUnique,
					seq_in_index AS columnPosition,
					sub_part AS prefixLength
				FROM information_schema.statistics
				WHERE table_schema = DATABASE()
			`.execute(db)
		).rows;
	} else {
		rows = (
			await sql<DatabaseIndexRow>`
				SELECT
					tables.name AS "tableName",
					indexes.name AS "indexName",
					columns.name AS "columnName",
					indexes.is_unique AS "isUnique",
					indexes.is_disabled AS "isDisabled",
					indexes.is_hypothetical AS "isHypothetical",
					indexes.has_filter AS "isPartial",
					index_columns.key_ordinal AS "columnPosition"
				FROM sys.indexes AS indexes
				INNER JOIN sys.tables AS tables
					ON indexes.object_id = tables.object_id
				INNER JOIN sys.schemas AS table_schemas
					ON table_schemas.schema_id = tables.schema_id
				INNER JOIN sys.index_columns AS index_columns
					ON index_columns.object_id = indexes.object_id
					AND index_columns.index_id = indexes.index_id
				INNER JOIN sys.columns AS columns
					ON columns.object_id = index_columns.object_id
					AND columns.column_id = index_columns.column_id
				WHERE table_schemas.name = ${schemaName}
					AND indexes.name IS NOT NULL
					AND index_columns.key_ordinal > 0
			`.execute(db)
		).rows;
	}

	const indexRows = new Map<
		string,
		{
			columns: { name: string; position: number }[];
			name: string;
			table: string;
			unique: boolean;
			validFullColumns: boolean;
		}
	>();
	for (const row of rows) {
		const table =
			row.tableName ??
			row.table_name ??
			row.TABLE_NAME ??
			row.tablename ??
			row.tbl_name;
		const name = row.indexName ?? row.index_name ?? row.INDEX_NAME ?? row.name;
		const column = row.columnName ?? row.column_name ?? row.COLUMN_NAME;
		if (!table || !name) continue;
		const key = createDatabaseIndexKey(table, name);
		const nonUnique = row.nonUnique ?? row.non_unique ?? row.NON_UNIQUE;
		const unique =
			nonUnique === undefined
				? databaseValueIsTrue(row.isUnique ?? row.is_unique)
				: !databaseValueIsTrue(nonUnique);
		const position = Number(
			row.columnPosition ??
				row.column_position ??
				row.keyOrdinal ??
				row.key_ordinal ??
				row.ordinality ??
				row.seqInIndex ??
				row.seq_in_index ??
				row.SEQ_IN_INDEX ??
				row.seqno ??
				0,
		);
		const index = indexRows.get(key) ?? {
			columns: [],
			name,
			table,
			unique,
			validFullColumns: true,
		};
		if (column) {
			index.columns.push({ name: column, position });
		} else {
			index.validFullColumns = false;
		}
		if (
			databaseValueIsTrue(row.isPartial) ||
			databaseValueIsTrue(row.isDisabled) ||
			databaseValueIsTrue(row.isHypothetical) ||
			(row.isValid !== undefined && !databaseValueIsTrue(row.isValid)) ||
			(row.prefixLength !== undefined && row.prefixLength !== null)
		) {
			index.validFullColumns = false;
		}
		indexRows.set(key, index);
	}

	return new Map<string, DatabaseIndexDefinition>(
		[...indexRows].map(([key, index]) => [
			key,
			{
				columns: index.columns
					.sort((left, right) => left.position - right.position)
					.map((column) => column.name),
				name: index.name,
				table: index.table,
				unique: index.unique,
				validFullColumns: index.validFullColumns,
			},
		]),
	);
}

async function getDatabaseColumnBounds(
	db: Kysely<unknown>,
	dbType: KyselyDatabaseType,
	schemaName: string,
) {
	if (dbType !== "mysql" && dbType !== "mssql") {
		return new Map<string, DatabaseColumnBound>();
	}

	let rows: readonly DatabaseColumnRow[];
	if (dbType === "mysql") {
		rows = (
			await sql<DatabaseColumnRow>`
				SELECT
					table_name AS tableName,
					column_name AS columnName,
					data_type AS dataType,
					character_maximum_length AS characterMaximumLength
				FROM information_schema.columns
				WHERE table_schema = DATABASE()
			`.execute(db)
		).rows;
	} else {
		rows = (
			await sql<DatabaseColumnRow>`
				SELECT
					tables.name AS "tableName",
					columns.name AS "columnName",
					types.name AS "dataType",
					columns.max_length AS "maxLength"
				FROM sys.columns AS columns
				INNER JOIN sys.tables AS tables
					ON tables.object_id = columns.object_id
				INNER JOIN sys.schemas AS table_schemas
					ON table_schemas.schema_id = tables.schema_id
				INNER JOIN sys.types AS types
					ON types.user_type_id = columns.user_type_id
				WHERE table_schemas.name = ${schemaName}
			`.execute(db)
		).rows;
	}

	return new Map(
		rows.flatMap((row) => {
			const table = row.tableName ?? row.TABLE_NAME;
			const column = row.columnName ?? row.COLUMN_NAME;
			const dataType = (row.dataType ?? row.DATA_TYPE)?.toLowerCase();
			if (!table || !column || !dataType) return [];

			if (dbType === "mysql") {
				const characterLength =
					row.characterMaximumLength ?? row.CHARACTER_MAXIMUM_LENGTH;
				const maxIndexBytes =
					characterLength === null || characterLength === undefined
						? null
						: Number(characterLength) * 4;
				return [
					[createDatabaseColumnKey(table, column), { maxIndexBytes }] as const,
				];
			}

			const maxLength = Number(row.maxLength ?? -1);
			return [
				[
					createDatabaseColumnKey(table, column),
					{ maxIndexBytes: maxLength < 0 ? null : maxLength },
				] as const,
			];
		}),
	);
}

function assertExistingTableIndexFits({
	columnBounds,
	dbType,
	existingColumns,
	fields,
	indexes,
	index,
	table,
}: {
	columnBounds: ReadonlyMap<string, DatabaseColumnBound>;
	dbType: "mssql" | "mysql";
	existingColumns: ReadonlySet<string>;
	fields: Readonly<Record<string, DBFieldAttribute>>;
	indexes: readonly ResolvedDBTableIndex[];
	index: ResolvedDBTableIndex;
	table: string;
}) {
	const byteBudget = dbType === "mysql" ? 3072 : 1700;
	let requiredBytes = 0;
	for (const column of index.columns) {
		const field = fields[column];
		if (!field) continue;
		if (field.type === "string" || Array.isArray(field.type)) {
			if (!existingColumns.has(column)) {
				const generatedLength = getDatabaseIndexStringLength({
					columnName: column,
					dialect: dbType,
					fields,
					indexes,
				});
				requiredBytes += (generatedLength ?? 0) * (dbType === "mysql" ? 4 : 1);
				continue;
			}
			const bound = columnBounds.get(createDatabaseColumnKey(table, column));
			if (!bound?.maxIndexBytes) {
				throw new BetterAuthError(
					`Cannot create database index "${index.name}" on existing table "${table}" because column "${column}" is not bounded for ${dbType === "mysql" ? "MySQL" : "SQL Server"}. Change it to a bounded string column, resolve oversized values, then run the migration again.`,
				);
			}
			requiredBytes += bound.maxIndexBytes;
		} else {
			requiredBytes += 16;
		}
	}
	if (requiredBytes > byteBudget) {
		throw new BetterAuthError(
			`Cannot create database index "${index.name}" on existing table "${table}" because its columns can exceed ${dbType === "mysql" ? "MySQL" : "SQL Server"}'s ${byteBudget}-byte index-key limit. Bound the indexed string columns to the generated schema lengths, resolve oversized values, then run the migration again.`,
		);
	}
}

export function matchType(
	columnDataType: string,
	fieldType: DBFieldType,
	dbType: KyselyDatabaseType,
) {
	function normalize(type: string) {
		return type.toLowerCase().split("(")[0]!.trim();
	}
	if (fieldType === "string[]" || fieldType === "number[]") {
		return columnDataType.toLowerCase().includes("json");
	}
	const types = map[dbType]!;
	const expected = Array.isArray(fieldType)
		? types["string"].map((t) => t.toLowerCase())
		: types[fieldType]!.map((t) => t.toLowerCase());
	return expected.includes(normalize(columnDataType));
}

/**
 * Get the current PostgreSQL schema (search_path) for the database connection
 * Returns the first schema in the search_path, defaulting to 'public' if not found
 */
async function getPostgresSchema(db: Kysely<unknown>): Promise<string> {
	try {
		const result = await sql<{
			search_path?: string;
			searchPath?: string;
		}>`SHOW search_path`.execute(db);
		const searchPath =
			result.rows[0]?.search_path ?? result.rows[0]?.searchPath;
		if (searchPath) {
			// search_path can be a comma-separated list like "$user, public" or '"$user", public'
			// Supabase may return escaped format like '"\$user", public'
			// We want the first non-variable schema
			const schemas = searchPath
				.split(",")
				.map((s) => s.trim())
				// Remove quotes and filter out variables like $user
				.map((s) => s.replace(/^["']|["']$/g, ""))
				// Filter out variable references like $user, \$user (escaped)
				.filter((s) => !s.startsWith("$") && !s.startsWith("\\$"));
			return schemas[0] || "public";
		}
	} catch {
		// If query fails, fall back to public schema
	}
	return "public";
}

async function getMssqlSchema(db: Kysely<unknown>): Promise<string> {
	try {
		const result = await sql<{ schemaName?: string }>`
			SELECT SCHEMA_NAME() AS "schemaName"
		`.execute(db);
		return result.rows[0]?.schemaName || "dbo";
	} catch {
		return "dbo";
	}
}

export async function getMigrations(config: BetterAuthOptions) {
	const betterAuthSchema = getSchema(config);
	const logger = createLogger(config.logger);

	let { kysely: db, databaseType: dbType } = await createKyselyAdapter(config);

	if (!dbType) {
		logger.warn(
			"Could not determine database type, defaulting to sqlite. Please provide a type in the database options to avoid this.",
		);
		dbType = "sqlite";
	}

	if (!db) {
		logger.error(
			"Only kysely adapter is supported for migrations. You can use `generate` command to generate the schema, if you're using a different adapter.",
		);
		process.exit(1);
	}

	let currentSchema = dbType === "mssql" ? await getMssqlSchema(db) : "public";
	if (dbType === "postgres") {
		currentSchema = await getPostgresSchema(db);
		logger.debug(
			`PostgreSQL migration: Using schema '${currentSchema}' (from search_path)`,
		);

		// Verify the schema exists
		try {
			const schemaCheck = await sql<{
				schema_name?: string;
				schemaName?: string;
			}>`
				SELECT schema_name
				FROM information_schema.schemata
				WHERE schema_name = ${currentSchema}
			`.execute(db);

			const schemaExists =
				schemaCheck.rows[0]?.schema_name ?? schemaCheck.rows[0]?.schemaName;
			if (!schemaExists) {
				logger.warn(
					`Schema '${currentSchema}' does not exist. Tables will be inspected from available schemas. Consider creating the schema first or checking your database configuration.`,
				);
			}
		} catch (error) {
			logger.debug(
				`Could not verify schema existence: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	} else if (dbType === "mssql") {
		logger.debug(
			`SQL Server migration: Using schema '${currentSchema}' (from the current user's default schema)`,
		);
	}

	const allTableMetadata = await db.introspection.getTables();
	const databaseIndexes = await getDatabaseIndexes(db, dbType, currentSchema);
	const databaseColumnBounds = await getDatabaseColumnBounds(
		db,
		dbType,
		currentSchema,
	);

	// Filter introspected tables to the schema used by unqualified migrations.
	let tableMetadata = allTableMetadata;
	if (dbType === "postgres") {
		// Get tables with their schema information
		try {
			const tablesInSchema = await sql<{
				table_name?: string;
				tableName?: string;
			}>`
				SELECT table_name
				FROM information_schema.tables
				WHERE table_schema = ${currentSchema}
				AND table_type = 'BASE TABLE'
			`.execute(db);

			const tableNamesInSchema = new Set(
				tablesInSchema.rows.map((row) => row.table_name ?? row.tableName),
			);

			// Filter to only tables that exist in the target schema
			tableMetadata = allTableMetadata.filter(
				(table) =>
					table.schema === currentSchema && tableNamesInSchema.has(table.name),
			);

			logger.debug(
				`Found ${tableMetadata.length} table(s) in schema '${currentSchema}': ${tableMetadata.map((t) => t.name).join(", ") || "(none)"}`,
			);
		} catch (error) {
			logger.warn(
				`Could not filter tables by schema. Using all discovered tables. Error: ${error instanceof Error ? error.message : String(error)}`,
			);
			// Fall back to using all tables if schema filtering fails
		}
	} else if (dbType === "mssql") {
		tableMetadata = allTableMetadata.filter(
			(table) => table.schema === currentSchema,
		);
	}
	const toBeCreated: {
		table: string;
		fields: Record<string, DBFieldAttribute>;
		order: number;
	}[] = [];
	const toBeAdded: {
		table: string;
		fields: Record<string, DBFieldAttribute>;
		order: number;
	}[] = [];
	const toBeAddedIndexes: {
		table: string;
		index: ResolvedDBTableIndex;
		name: string;
	}[] = [];
	const plannedIndexes = new Map<string, ResolvedDBTableIndex>();

	for (const [key, value] of Object.entries(betterAuthSchema)) {
		if (value.disableMigrations) {
			continue;
		}
		const table = tableMetadata.find((table) => table.name === key);
		for (const index of value.indexes ?? []) {
			const name = index.name;
			const indexKey = createDatabaseIndexKey(key, name);
			const existingIndex = databaseIndexes.get(indexKey);
			if (existingIndex) {
				if (!databaseIndexMatches(existingIndex, index)) {
					throw new BetterAuthError(
						`Database index "${name}" on table "${key}" does not match the configured fields and uniqueness. Rename or replace the existing index, then run the migration again.`,
					);
				}
				continue;
			}
			if (dbType === "sqlite" || dbType === "postgres") {
				const indexOnAnotherTable = [...databaseIndexes.values()].find(
					(databaseIndex) =>
						getPortableDatabaseIdentifierKey(databaseIndex.name) ===
							getPortableDatabaseIdentifierKey(name) &&
						getPortableDatabaseIdentifierKey(databaseIndex.table) !==
							getPortableDatabaseIdentifierKey(key),
				);
				if (indexOnAnotherTable) {
					throw new BetterAuthError(
						`Database index name "${name}" is already used by table "${indexOnAnotherTable.table}". Index names must be unique across the schema.`,
					);
				}
			}
			const plannedIndex = plannedIndexes.get(indexKey);
			if (plannedIndex) {
				const plannedDefinition: DatabaseIndexDefinition = {
					columns: plannedIndex.columns,
					name: plannedIndex.name,
					table: key,
					unique: plannedIndex.unique ?? false,
					validFullColumns: true,
				};
				if (!databaseIndexMatches(plannedDefinition, index)) {
					throw new BetterAuthError(
						`Database index name "${name}" identifies more than one index on table "${key}".`,
					);
				}
				continue;
			}
			if (table && (dbType === "mysql" || dbType === "mssql")) {
				assertExistingTableIndexFits({
					columnBounds: databaseColumnBounds,
					dbType,
					existingColumns: new Set(table.columns.map((column) => column.name)),
					fields: value.fields,
					index,
					indexes: value.indexes ?? [],
					table: key,
				});
			}
			plannedIndexes.set(indexKey, index);
			toBeAddedIndexes.push({ table: key, index, name });
		}
		if (!table) {
			const tIndex = toBeCreated.findIndex((t) => t.table === key);
			const tableData = {
				table: key,
				fields: value.fields,
				order: value.order || Infinity,
			};

			const insertIndex = toBeCreated.findIndex(
				(t) => (t.order || Infinity) > tableData.order,
			);

			if (insertIndex === -1) {
				if (tIndex === -1) {
					toBeCreated.push(tableData);
				} else {
					toBeCreated[tIndex]!.fields = {
						...toBeCreated[tIndex]!.fields,
						...value.fields,
					};
				}
			} else {
				toBeCreated.splice(insertIndex, 0, tableData);
			}
			continue;
		}
		const toBeAddedFields: Record<string, DBFieldAttribute> = {};
		for (const [fieldName, field] of Object.entries(value.fields)) {
			const column = table.columns.find((c) => c.name === fieldName);
			if (!column) {
				toBeAddedFields[fieldName] = field;
				continue;
			}

			if (matchType(column.dataType, field.type, dbType)) {
				continue;
			} else {
				logger.warn(
					`Field ${fieldName} in table ${key} has a different type in the database. Expected ${field.type} but got ${column.dataType}.`,
				);
			}
		}
		if (Object.keys(toBeAddedFields).length > 0) {
			toBeAdded.push({
				table: key,
				fields: toBeAddedFields,
				order: value.order || Infinity,
			});
		}
	}

	const migrations: (
		| AlterTableColumnAlteringBuilder
		| CreateTableBuilder<string, string>
		| CreateIndexBuilder
	)[] = [];

	const useUUIDs = config.advanced?.database?.generateId === "uuid";
	const useNumberId = config.advanced?.database?.generateId === "serial";

	function getType(
		field: DBFieldAttribute,
		fieldName: string,
		tableIndexStringLength?: number | undefined,
	) {
		const type = field.type;
		const provider = dbType || "sqlite";
		type StringOnlyUnion<T> = T extends string ? T : never;
		const typeMap: Record<
			StringOnlyUnion<DBFieldType> | "id" | "foreignKeyId",
			Record<KyselyDatabaseType, ColumnDataType | RawBuilder<unknown>>
		> = {
			string: {
				sqlite: "text",
				postgres: "text",
				mysql: tableIndexStringLength
					? `varchar(${tableIndexStringLength})`
					: field.unique
						? "varchar(255)"
						: field.references
							? "varchar(36)"
							: field.sortable
								? "varchar(255)"
								: field.index
									? "varchar(255)"
									: "text",
				mssql: tableIndexStringLength
					? `varchar(${tableIndexStringLength})`
					: field.unique || field.sortable
						? "varchar(255)"
						: field.references
							? "varchar(36)"
							: // mssql deprecated `text`, and the alternative is `varchar(max)`.
								// Kysely type interface doesn't support `text`, so we set this to `varchar(8000)` as
								// that's the max length for `varchar`
								"varchar(8000)",
			},
			boolean: {
				sqlite: "integer",
				postgres: "boolean",
				mysql: "boolean",
				mssql: "smallint",
			},
			number: {
				sqlite: field.bigint ? "bigint" : "integer",
				postgres: field.bigint ? "bigint" : "integer",
				mysql: field.bigint ? "bigint" : "integer",
				mssql: field.bigint ? "bigint" : "integer",
			},
			date: {
				sqlite: "date",
				postgres: "timestamptz",
				mysql: "timestamp(3)",
				mssql: sql`datetime2(3)`,
			},
			json: {
				sqlite: "text",
				postgres: "jsonb",
				mysql: "json",
				mssql: "varchar(8000)",
			},
			id: {
				postgres: useNumberId
					? sql`integer GENERATED BY DEFAULT AS IDENTITY`
					: useUUIDs
						? "uuid"
						: "text",
				mysql: useNumberId
					? "integer"
					: useUUIDs
						? "varchar(36)"
						: "varchar(36)",
				mssql: useNumberId
					? "integer"
					: useUUIDs
						? "varchar(36)"
						: "varchar(36)",
				sqlite: useNumberId ? "integer" : "text",
			},
			foreignKeyId: {
				postgres: useNumberId ? "integer" : useUUIDs ? "uuid" : "text",
				mysql: useNumberId
					? "integer"
					: useUUIDs
						? "varchar(36)"
						: "varchar(36)",
				mssql: useNumberId
					? "integer"
					: useUUIDs
						? "varchar(36)" /* Should be using `UNIQUEIDENTIFIER` but Kysely doesn't support it */
						: "varchar(36)",
				sqlite: useNumberId ? "integer" : "text",
			},
			"string[]": {
				sqlite: "text",
				postgres: "jsonb",
				mysql: "json",
				mssql: "varchar(8000)",
			},
			"number[]": {
				sqlite: "text",
				postgres: "jsonb",
				mysql: "json",
				mssql: "varchar(8000)",
			},
		} as const;
		if (fieldName === "id" || field.references?.field === "id") {
			if (fieldName === "id") {
				return typeMap.id[provider];
			}
			return typeMap.foreignKeyId[provider];
		}
		if (Array.isArray(type)) {
			return "text";
		}
		if (!(type in typeMap)) {
			throw new Error(
				`Unsupported field type '${String(type)}' for field '${fieldName}'. Allowed types are: string, number, boolean, date, string[], number[]. If you need to store structured data, store it as a JSON string (type: "string") or split it into primitive fields. See https://better-auth.com/docs/advanced/schema#additional-fields`,
			);
		}
		return typeMap[type][provider];
	}
	const getModelName = initGetModelName({
		schema: getAuthTables(config),
		usePlural: false,
	});
	const getFieldName = initGetFieldName({
		schema: getAuthTables(config),
		usePlural: false,
	});

	// Helper function to safely resolve model and field names, falling back to
	// user-supplied strings for external tables not in the BetterAuth schema
	function getReferencePath(model: string, field: string): string {
		try {
			const modelName = getModelName(model);
			const fieldName = getFieldName({ model, field });
			return `${modelName}.${fieldName}`;
		} catch {
			// If resolution fails (external table), fall back to user-supplied references
			return `${model}.${field}`;
		}
	}

	// Indexes are collected separately and appended last to ensure all
	// referenced columns/tables exist before any CREATE INDEX executes.
	const deferredIndexes: CreateIndexBuilder[] = [];
	const getTableIndexStringLength = (tableName: string, fieldName: string) => {
		if (dbType !== "mysql" && dbType !== "mssql") return undefined;
		const table = betterAuthSchema[tableName];
		if (!table) return undefined;
		return getDatabaseIndexStringLength({
			columnName: fieldName,
			dialect: dbType,
			fields: table.fields,
			indexes: table.indexes ?? [],
		});
	};

	if (toBeAdded.length) {
		for (const table of toBeAdded) {
			for (const [fieldName, field] of Object.entries(table.fields)) {
				const type = getType(
					field,
					fieldName,
					getTableIndexStringLength(table.table, fieldName),
				);
				const builder = db.schema.alterTable(table.table);

				// SQLite cannot add a column with an inline UNIQUE constraint, so a
				// unique field is enforced with a separate index in the ALTER path.
				if (field.index || field.unique) {
					const indexName = getDatabaseFieldIndexName(
						table.table,
						fieldName,
						field.unique ?? false,
					);
					let indexBuilder = db.schema
						.createIndex(indexName)
						.on(table.table)
						.columns([fieldName]);
					if (field.unique) {
						indexBuilder = indexBuilder.unique();
						if (field.required === false && dbType === "mssql") {
							// MSSQL unique indexes treat NULLs as duplicates, so the
							// NULL backfill on existing rows would abort the index
							// build. Filtering NULLs matches the other dialects.
							indexBuilder = indexBuilder.where(fieldName, "is not", null);
						}
						if (
							field.required !== false &&
							field.defaultValue !== undefined &&
							field.defaultValue !== null &&
							typeof field.defaultValue !== "function"
						) {
							logger.warn(
								`Adding unique column "${fieldName}" to existing table "${table.table}" backfills every existing row with its default value. If the table has more than one row, creating the unique index "${indexName}" will fail; backfill distinct values manually, then re-run the migration or create the index yourself.`,
							);
						}
					}
					deferredIndexes.push(indexBuilder);
				}

				const built = builder.addColumn(fieldName, type, (col) => {
					col = field.required !== false ? col.notNull() : col;
					if (field.references) {
						col = col
							.references(
								getReferencePath(
									field.references.model,
									field.references.field,
								),
							)
							.onDelete(field.references.onDelete || "cascade");
					}
					if (
						field.type === "date" &&
						typeof field.defaultValue === "function" &&
						(dbType === "postgres" || dbType === "mysql" || dbType === "mssql")
					) {
						if (dbType === "mysql") {
							col = col.defaultTo(sql`CURRENT_TIMESTAMP(3)`);
						} else {
							col = col.defaultTo(sql`CURRENT_TIMESTAMP`);
						}
					} else if (
						!(field.unique && field.required === false) &&
						(field.type === "string" ||
							field.type === "number" ||
							field.type === "boolean") &&
						field.defaultValue !== undefined &&
						field.defaultValue !== null &&
						typeof field.defaultValue !== "function"
					) {
						// A required column added to a populated table needs a SQL
						// default, or the NOT NULL add fails. Nullable unique columns
						// are excluded: NULL is their only unique-safe backfill. A
						// required unique column keeps its default; on a table with
						// more than one row the unique index then rejects the shared
						// backfill, which no generated migration can avoid.
						// Booleans map to 1/0 on engines without a native boolean type.
						col = col.defaultTo(
							typeof field.defaultValue === "boolean" &&
								(dbType === "sqlite" || dbType === "mssql")
								? field.defaultValue
									? 1
									: 0
								: field.defaultValue,
						);
					}
					return col;
				});
				migrations.push(built);
			}
		}
	}

	if (toBeCreated.length) {
		for (const table of toBeCreated) {
			const idType = getType({ type: useNumberId ? "number" : "string" }, "id");
			let dbT = db.schema
				.createTable(table.table)
				.addColumn("id", idType, (col) => {
					if (useNumberId) {
						if (dbType === "postgres") {
							// Identity column is already specified in the type via sql template tag
							return col.primaryKey().notNull();
						} else if (dbType === "sqlite") {
							return col.primaryKey().notNull();
						} else if (dbType === "mssql") {
							return col.identity().primaryKey().notNull();
						}
						return col.autoIncrement().primaryKey().notNull();
					}
					if (useUUIDs) {
						if (dbType === "postgres") {
							return col
								.primaryKey()
								.defaultTo(sql`pg_catalog.gen_random_uuid()`)
								.notNull();
						}
						return col.primaryKey().notNull();
					}
					return col.primaryKey().notNull();
				});

			for (const [fieldName, field] of Object.entries(table.fields)) {
				const type = getType(
					field,
					fieldName,
					getTableIndexStringLength(table.table, fieldName),
				);
				dbT = dbT.addColumn(fieldName, type, (col) => {
					col = field.required !== false ? col.notNull() : col;
					if (field.references) {
						col = col
							.references(
								getReferencePath(
									field.references.model,
									field.references.field,
								),
							)
							.onDelete(field.references.onDelete || "cascade");
					}

					if (field.unique) {
						col = col.unique();
					}
					if (
						field.type === "date" &&
						typeof field.defaultValue === "function" &&
						(dbType === "postgres" || dbType === "mysql" || dbType === "mssql")
					) {
						if (dbType === "mysql") {
							col = col.defaultTo(sql`CURRENT_TIMESTAMP(3)`);
						} else {
							col = col.defaultTo(sql`CURRENT_TIMESTAMP`);
						}
					}
					return col;
				});

				if (field.index && !field.unique) {
					const builder = db.schema
						.createIndex(
							getDatabaseFieldIndexName(table.table, fieldName, false),
						)
						.on(table.table)
						.columns([fieldName]);
					deferredIndexes.push(builder);
				}
			}
			migrations.push(dbT);
		}
	}

	for (const { table, index, name } of toBeAddedIndexes) {
		let builder = db.schema
			.createIndex(name)
			.on(table)
			.columns([...index.columns]);
		if (index.unique) {
			builder = builder.unique();
		}
		deferredIndexes.push(builder);
	}

	for (const index of deferredIndexes) {
		migrations.push(index);
	}

	async function runMigrations() {
		for (const migration of migrations) {
			await migration.execute();
		}
	}
	async function compileMigrations() {
		const compiled = migrations.map((m) => m.compile().sql);
		return compiled.join(";\n\n") + ";";
	}
	return {
		toBeCreated,
		toBeAdded,
		toBeAddedIndexes,
		runMigrations,
		compileMigrations,
	};
}
