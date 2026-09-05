import type { BetterAuthOptions } from "@better-auth/core";
import type {
	IntrospectedTable,
	SchemaFinding,
} from "@better-auth/core/db/internal";
import { diffSchema, getExpectedSchema } from "@better-auth/core/db/internal";
import { getTableColumns, is, Table } from "drizzle-orm";

/**
 * Reads a Drizzle schema object the way the adapter addresses it: each table
 * by the key it is exported under, each column by its property name. Values
 * that are not tables, such as relations, are skipped.
 */
function introspectDrizzleSchema(
	schema: Record<string, unknown>,
): IntrospectedTable[] {
	const tables: IntrospectedTable[] = [];
	for (const [name, table] of Object.entries(schema)) {
		if (!is(table, Table)) continue;
		const columns = Object.entries(getTableColumns(table)).map(
			([key, column]) => ({
				name: key,
				nullable: !column.notNull,
				hasDefault:
					column.hasDefault ||
					column.generated !== undefined ||
					column.generatedIdentity !== undefined,
			}),
		);
		tables.push({ name, columns });
	}
	return tables;
}

/**
 * Compares a Drizzle schema object with the tables this configuration writes.
 */
export function findDrizzleSchemaProblems(
	schema: Record<string, unknown>,
	options: BetterAuthOptions,
	usePlural?: boolean | undefined,
): SchemaFinding[] {
	return diffSchema(
		getExpectedSchema(options, { usePlural }),
		introspectDrizzleSchema(schema),
	);
}
