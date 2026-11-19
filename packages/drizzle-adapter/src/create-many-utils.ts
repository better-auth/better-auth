import { getTableColumns, is, Table } from "drizzle-orm";

export function rowsShareKeys(rows: Record<string, unknown>[]): boolean {
	const first = rows[0];
	if (!first || rows.length < 2) return true;
	const expected = new Set(Object.keys(first));
	return rows.every((row) => {
		const keys = Object.keys(row);
		return (
			keys.length === expected.size && keys.every((key) => expected.has(key))
		);
	});
}

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

export function chunkByMaxRows<T>(rows: T[], maxRows: number): T[][] {
	const size = Math.max(1, maxRows);
	if (rows.length <= size) return [rows];
	const chunks: T[][] = [];
	for (let offset = 0; offset < rows.length; offset += size) {
		chunks.push(rows.slice(offset, offset + size));
	}
	return chunks;
}
