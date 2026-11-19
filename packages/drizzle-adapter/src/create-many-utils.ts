import { BetterAuthError } from "@better-auth/core/error";
import { getTableColumns, is, Table } from "drizzle-orm";

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function idMatchKey(id: unknown): string {
	const value = String(id);
	return uuidPattern.test(value) ? value.toLowerCase() : value;
}

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

export function orderInsertedRowsById<T extends Record<string, unknown>>(
	ids: unknown[],
	rows: T[],
	idField: string,
	model: string,
): T[] {
	const byId = new Map(
		rows.map((row) => [idMatchKey(row[idField] ?? row.id), row]),
	);
	return ids.map((id) => {
		const row = byId.get(idMatchKey(id));
		if (!row) {
			throw new BetterAuthError(
				`[# Drizzle Adapter]: createMany could not read back inserted "${model}" row ${String(id)}.`,
			);
		}
		return row;
	});
}
