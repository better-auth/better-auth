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
		const sent = sentIdentifiers(
			db as Kysely<AnyTables>,
			table,
			entries.map(([column]) => column),
		);
		const fields: ExpectedSchema[string]["fields"] = {};
		entries.forEach(([column, attribute], index) => {
			fields[sent.columns[index] ?? column] = attribute;
		});
		physical[sent.table] = {
			...definition,
			fields,
			schema: sent.schema ?? definition.schema,
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
 * Get the current PostgreSQL schema (search_path) for the database connection
 * Returns the first schema in the search_path, defaulting to 'public' if not found
 */
export async function getPostgresSchema(db: Kysely<unknown>): Promise<string> {
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

export async function getMssqlSchema(db: Kysely<unknown>): Promise<string> {
	try {
		const result = await sql<{ schemaName?: string }>`
			SELECT SCHEMA_NAME() AS "schemaName"
		`.execute(db);
		return result.rows[0]?.schemaName || "dbo";
	} catch {
		return "dbo";
	}
}

/**
 * The schema an unqualified table name resolves to on this connection, for
 * the stores that have schemas.
 */
async function defaultSchema(
	db: Kysely<unknown>,
	dbType: KyselyDatabaseType | undefined,
): Promise<string | undefined> {
	if (dbType === "postgres") return getPostgresSchema(db);
	if (dbType === "mssql") return getMssqlSchema(db);
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
	const fallback = await defaultSchema(db, dbType);
	for (const table of Object.values(physical)) {
		table.schema ??= fallback;
	}
	return diffSchema(
		physical,
		toIntrospectedTables(await db.introspection.getTables()),
	);
}
