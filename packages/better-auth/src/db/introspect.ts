import type { IntrospectedTable } from "@better-auth/core/db/internal";
import type { TableMetadata } from "kysely";

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
