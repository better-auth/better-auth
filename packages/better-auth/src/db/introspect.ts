import type {
	ExpectedSchema,
	IntrospectedTable,
} from "@better-auth/core/db/internal";
import type { Kysely, TableMetadata } from "kysely";
import { ColumnNode, ReferenceNode, SelectQueryNode, TableNode } from "kysely";

type AnyTables = Record<string, Record<string, unknown>>;

/**
 * Converts Kysely table metadata into the shape `diffSchema` compares.
 */
export function toIntrospectedTables(
	tables: readonly TableMetadata[],
): IntrospectedTable[] {
	return tables.map((table) => ({
		name: table.name,
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
		physical[sent.table] = { ...definition, fields };
	}
	return physical;
}

/**
 * Compiles a select of `columns` from `table` and reads the identifiers back
 * out of the transformed query. A node the query does not carry in the
 * expected shape leaves its identifier undefined.
 */
function sentIdentifiers(
	db: Kysely<AnyTables>,
	table: string,
	columns: string[],
): { table: string; columns: (string | undefined)[] } {
	const { query } = db.selectFrom(table).select(columns).compile();
	if (!SelectQueryNode.is(query)) return { table, columns: [] };
	const from = query.from?.froms[0];
	return {
		table: from && TableNode.is(from) ? from.table.identifier.name : table,
		columns: (query.selections ?? []).map(({ selection }) =>
			ReferenceNode.is(selection) && ColumnNode.is(selection.column)
				? selection.column.column.name
				: undefined,
		),
	};
}
