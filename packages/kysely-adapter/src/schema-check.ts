import type {
	ExpectedSchema,
	IntrospectedTable,
	SchemaFinding,
} from "@better-auth/core/db/internal";
import { diffSchema } from "@better-auth/core/db/internal";
import { logger } from "@better-auth/core/env";
import type { Kysely, TableMetadata } from "kysely";
import {
	ColumnNode,
	ReferenceNode,
	SelectQueryNode,
	sql,
	TableNode,
} from "kysely";
import {
	DEFAULT_MIGRATION_LOCK_TABLE,
	DEFAULT_MIGRATION_TABLE,
} from "./kysely-migration-tables";
import type { KyselyDatabaseType } from "./types";

type AnyTables = Record<string, Record<string, unknown>>;

/**
 * Converts Kysely table metadata into the shape `diffSchema` compares.
 */
export function toIntrospectedTables(
	tables: readonly TableMetadata[],
): IntrospectedTable[] {
	return tables.map((table) => ({
		name: table.name,
		schema: table.schema,
		columns: table.columns.map((column) => ({
			name: column.name,
			nullable: column.isNullable,
			hasDefault: column.hasDefaultValue || column.isAutoIncrementing,
		})),
	}));
}

/**
 * The expected schema in the identifiers the connection sends. A plugin that
 * renames identifiers, such as `CamelCasePlugin`, does so in `transformQuery`,
 * so compiling one select per table through the connection yields the names
 * the database is asked for. Without such a plugin the schema is unchanged.
 */
export function toPhysicalSchema(
	db: Kysely<unknown>,
	expected: ExpectedSchema,
): ExpectedSchema {
	const physical: ExpectedSchema = {};
	for (const [table, definition] of Object.entries(expected)) {
		const entries = Object.entries(definition.fields);
		const sent = sentIdentifiers(db as Kysely<AnyTables>, table, [
			definition.idColumn ?? "id",
			...entries.map(([column]) => column),
		]);
		const fields: ExpectedSchema[string]["fields"] = {};
		entries.forEach(([column, attribute], index) => {
			fields[sent.columns[index + 1] ?? column] = attribute;
		});
		physical[sent.table] = {
			...definition,
			fields,
			schema: sent.schema ?? definition.schema,
			...(sent.columns[0] !== "id" && { idColumn: sent.columns[0] }),
		};
	}
	return physical;
}

/**
 * Compiles a select of `columns` from `table` and reads the identifiers back
 * out of the transformed query, including the schema a plugin such as
 * `WithSchemaPlugin` qualifies the table with. A node the query does not
 * carry in the expected shape leaves its identifier undefined.
 */
function sentIdentifiers(
	db: Kysely<AnyTables>,
	table: string,
	columns: string[],
): {
	schema?: string | undefined;
	table: string;
	columns: (string | undefined)[];
} {
	const { query } = db.selectFrom(table).select(columns).compile();
	if (!SelectQueryNode.is(query)) return { table, columns: [] };
	// cspell:ignore froms
	const from = query.from?.froms[0];
	const sentTable = from && TableNode.is(from) ? from.table : undefined;
	return {
		schema: sentTable?.schema?.name,
		table: sentTable?.identifier.name ?? table,
		columns: (query.selections ?? []).map(({ selection }) =>
			ReferenceNode.is(selection) && ColumnNode.is(selection.column)
				? selection.column.column.name
				: undefined,
		),
	};
}

/**
 * The default schema for migration tooling. Let PostgreSQL resolve role
 * names and privileges, retaining the legacy public fallback when none exists.
 * Runtime validation uses the effective search path instead of this fallback.
 */
export async function getPostgresSchema(db: Kysely<unknown>): Promise<string> {
	const result = await sql<{ schema: string | null }>`
		SELECT pg_catalog.current_schema() AS schema
	`.execute(db.withoutPlugins());
	return result.rows[0]?.schema ?? "public";
}

export async function getMssqlSchema(db: Kysely<unknown>): Promise<string> {
	const result = await sql<{ schemaName?: string }>`
		SELECT SCHEMA_NAME() AS "schemaName"
	`.execute(db.withoutPlugins());
	return result.rows[0]?.schemaName || "dbo";
}

async function schemaSearchPath(
	db: Kysely<unknown>,
	dbType: KyselyDatabaseType | undefined,
): Promise<string[] | undefined> {
	if (dbType === "postgres") {
		const result = await sql<{ schemas: string[] }>`
			SELECT pg_catalog.current_schemas(true)::text[] AS schemas
		`.execute(db.withoutPlugins());
		return result.rows[0]?.schemas ?? [];
	}
	if (dbType === "mssql") return [await getMssqlSchema(db), "dbo"];
	return undefined;
}

function quoteSqliteStringLiteral(value: string) {
	return `'${value.replaceAll("'", "''")}'`;
}

function isSqliteAuthDenied(error: unknown): boolean {
	const seen = new Set<unknown>();
	let current: unknown = error;
	while (current !== undefined && current !== null && !seen.has(current)) {
		seen.add(current);
		if (typeof current === "string") {
			return current.includes("SQLITE_AUTH");
		}
		if (typeof current !== "object") {
			return false;
		}
		if (
			"code" in current &&
			(current.code === "SQLITE_AUTH" || current.code === 23)
		) {
			return true;
		}
		if (
			"message" in current &&
			typeof current.message === "string" &&
			current.message.includes("SQLITE_AUTH")
		) {
			return true;
		}
		current = "cause" in current ? current.cause : undefined;
	}
	return false;
}

interface SqliteTableListRow {
	schema?: string | null | undefined;
	name: string;
	type: string;
}

interface SqliteTableInfoRow {
	name: string;
	type: string;
	notnull: number | boolean;
	dflt_value: unknown;
	pk: number;
}

/**
 * D1-safe SQLite introspection. Statement-form PRAGMA is permitted where
 * `sqlite_master` and table-valued `pragma_table_info(...)` are not. Run
 * without plugins so result keys stay snake_case (`dflt_value`), matching
 * Kysely's own introspector.
 *
 * @see https://github.com/better-auth/better-auth/issues/11346
 * @see https://github.com/better-auth/better-auth/issues/10976
 */
async function introspectSqliteTables(
	db: Kysely<unknown>,
): Promise<IntrospectedTable[]> {
	const raw = db.withoutPlugins();
	const listed = await sql<SqliteTableListRow>`PRAGMA table_list`.execute(raw);
	const tables = listed.rows.filter((row) => {
		const type = row.type.toLowerCase();
		if (type !== "table" && type !== "view") return false;
		if (row.name.startsWith("sqlite_") || row.name.startsWith("_cf_")) {
			return false;
		}
		if (
			row.name === DEFAULT_MIGRATION_TABLE ||
			row.name === DEFAULT_MIGRATION_LOCK_TABLE
		) {
			return false;
		}
		return (row.schema ?? "main") === "main";
	});

	const introspected: IntrospectedTable[] = [];
	for (const table of tables) {
		const info = await sql<SqliteTableInfoRow>`PRAGMA table_info(${sql.raw(
			quoteSqliteStringLiteral(table.name),
		)})`.execute(raw);
		const columns = info.rows;
		const pkCols = columns.filter((column) => Number(column.pk) > 0);
		const singlePk = pkCols.length === 1 ? pkCols[0] : undefined;
		const autoIncrementCol =
			singlePk && singlePk.type.toLowerCase() === "integer"
				? singlePk.name
				: undefined;
		introspected.push({
			name: table.name,
			columns: columns.map((column) => ({
				name: column.name,
				nullable: !column.notnull,
				hasDefault:
					column.dflt_value != null || column.name === autoIncrementCol,
			})),
		});
	}
	return introspected;
}

async function introspectTables(
	connection: Kysely<unknown>,
	dbType: KyselyDatabaseType | undefined,
): Promise<IntrospectedTable[] | "skipped"> {
	try {
		return toIntrospectedTables(await connection.introspection.getTables());
	} catch (error) {
		if (
			!isSqliteAuthDenied(error) ||
			(dbType !== undefined && dbType !== "sqlite")
		) {
			throw error;
		}
		try {
			return await introspectSqliteTables(connection);
		} catch (pragmaError) {
			if (!isSqliteAuthDenied(pragmaError)) {
				throw pragmaError;
			}
			logger.warn(
				"[Kysely Adapter] Skipping schema validation because the database denied catalog introspection (SQLITE_AUTH). Cloudflare D1 blocks sqlite_master and table-valued PRAGMA functions.",
			);
			return "skipped";
		}
	}
}

/**
 * Compares the live database with the tables this configuration writes. Both
 * sides are read in the identifiers the connection sends: a plugin that
 * renames identifiers or qualifies them with a schema is applied to the
 * expected side, and introspection reports what the database stores.
 *
 * On SQLite, Cloudflare D1 denies Kysely's `sqlite_master` / table-valued
 * PRAGMA catalog reads. When that happens, metadata is read with
 * statement-form `PRAGMA table_list` / `PRAGMA table_info(...)`. If those are
 * denied too, validation is skipped rather than failing every request.
 */
export async function findSchemaProblems(
	db: Kysely<unknown>,
	dbType: KyselyDatabaseType | undefined,
	expected: ExpectedSchema,
): Promise<SchemaFinding[]> {
	const physical = toPhysicalSchema(db, expected);
	return db.connection().execute(async (connection) => {
		const searchPath = await schemaSearchPath(connection, dbType);
		const tables = await introspectTables(connection, dbType);
		if (tables === "skipped") return [];
		for (const [name, table] of Object.entries(physical)) {
			if (table.schema !== undefined || !searchPath) continue;
			table.schema =
				searchPath.find((schema) =>
					tables.some(
						(candidate) =>
							candidate.name === name && candidate.schema === schema,
					),
				) ?? "";
		}
		return diffSchema(physical, tables);
	});
}
