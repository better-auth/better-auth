import { getTableColumns, is, Table } from "drizzle-orm";

export function getInsertColumnCount(
	table: unknown,
	rows: Record<string, unknown>[],
): number {
	if (is(table, Table)) {
		const count = Object.keys(getTableColumns(table)).length;
		if (count > 0) return count;
	}
	return Math.max(1, new Set(rows.flatMap((row) => Object.keys(row))).size);
}
