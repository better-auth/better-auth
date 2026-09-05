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
	return db.connection().execute(async (connection) => {
		const searchPath = await schemaSearchPath(connection, dbType);
		const tables = toIntrospectedTables(
			await connection.introspection.getTables(),
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
