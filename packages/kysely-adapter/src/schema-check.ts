import type {
	ExpectedSchema,
	IntrospectedTable,
	SchemaFinding,
} from "@better-auth/core/db/internal";
import { diffSchema } from "@better-auth/core/db/internal";
import type { Kysely, TableMetadata } from "kysely";
import {
	ColumnNode,
	ReferenceNode,
	SelectQueryNode,
	sql,
	TableNode,
} from "kysely";
import { introspectSqliteTables } from "./sqlite-introspector";
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

/**
 * Reads the tables in `schemas` with the metadata Kysely's PostgreSQL
 * introspector reports. That introspector reads every schema and resolves
 * each one by name, so a schema another connection drops during the read
 * fails it with "schema does not exist" or "relation does not exist".
 */
export async function introspectPostgresTables(
	db: Kysely<unknown>,
	schemas: readonly string[],
): Promise<TableMetadata[]> {
	if (schemas.length === 0) return [];
	const { rows } = await sql<{
		schema: string;
		table: string;
		isView: boolean;
		column: string;
		dataType: string;
		isNullable: boolean;
		hasDefaultValue: boolean;
		isAutoIncrementing: boolean;
	}>`
		SELECT
			ns.nspname AS "schema",
			c.relname AS "table",
			c.relkind = 'v' AS "isView",
			a.attname AS "column",
			typ.typname AS "dataType",
			NOT a.attnotnull AS "isNullable",
			a.atthasdef AS "hasDefaultValue",
			pg_catalog.pg_get_serial_sequence(
				pg_catalog.quote_ident(ns.nspname) || '.' || pg_catalog.quote_ident(c.relname),
				a.attname
			) IS NOT NULL AS "isAutoIncrementing"
		FROM pg_catalog.pg_attribute AS a
		INNER JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
		INNER JOIN pg_catalog.pg_namespace AS ns ON ns.oid = c.relnamespace
		INNER JOIN pg_catalog.pg_type AS typ ON typ.oid = a.atttypid
		WHERE ns.nspname IN (${sql.join(schemas)})
			AND ns.nspname !~ '^pg_'
			AND pg_catalog.has_schema_privilege(ns.oid, 'USAGE')
			AND c.relkind IN ('r', 'v', 'p')
			AND a.attnum >= 0
			AND NOT a.attisdropped
		ORDER BY ns.nspname, c.relname, a.attnum
	`.execute(db.withoutPlugins());
	const tables: TableMetadata[] = [];
	let current: TableMetadata | undefined;
	for (const { schema, table, isView, column, ...metadata } of rows) {
		if (current?.schema !== schema || current.name !== table) {
			current = { name: table, schema, isView, columns: [] };
			tables.push(current);
		}
		current.columns.push({ name: column, ...metadata });
	}
	return tables;
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

/**
 * Compares the live database with the tables this configuration writes. Both
 * sides are read in the identifiers the connection sends: a plugin that
 * renames identifiers or qualifies them with a schema is applied to the
 * expected side, and introspection reports what the database stores.
 */
export async function findSchemaProblems(
	db: Kysely<unknown>,
	dbType: KyselyDatabaseType | undefined,
	expected: ExpectedSchema,
): Promise<SchemaFinding[]> {
	const physical = toPhysicalSchema(db, expected);
	if (dbType === "sqlite") {
		const tableNames = Object.entries(physical).flatMap(([name, table]) =>
			table.disableMigrations ? [] : [name],
		);
		const tables = await introspectSqliteTables(db, tableNames);
		return diffSchema(physical, toIntrospectedTables(tables));
	}

	return db.connection().execute(async (connection) => {
		const searchPath = await schemaSearchPath(connection, dbType);
		const tables = toIntrospectedTables(
			dbType === "postgres"
				? await introspectPostgresTables(connection, [
						...(searchPath ?? []),
						...Object.values(physical).flatMap(({ schema }) => schema ?? []),
					])
				: await connection.introspection.getTables(),
		);
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
