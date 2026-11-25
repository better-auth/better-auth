import { BetterAuthError } from "@better-auth/core/error";
import { getTableColumns, is, Table } from "drizzle-orm";

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rowId<T extends Record<string, unknown>>(
	row: T,
	idField: string,
): string {
	return String(row[idField] ?? row.id);
}

function uuidKey(id: unknown): string | undefined {
	const value = String(id);
	return uuidPattern.test(value) ? value.toLowerCase() : undefined;
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

export function requireInsertedRow<T>(
	row: T | null | undefined,
	model: string,
): T {
	if (row == null) {
		throw new BetterAuthError(
			`[# Drizzle Adapter]: createMany could not read back inserted "${model}" row.`,
		);
	}
	return row;
}

export function chunkByMaxRows<T>(rows: T[], maxRows: number): T[][] {
	const size =
		Number.isFinite(maxRows) && maxRows >= 1 ? Math.floor(maxRows) : 1;
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
	const byExactId = new Map<string, T>();
	const byUuid = new Map<string, T>();
	const ambiguousUuids = new Set<string>();

	for (const row of rows) {
		const exact = rowId(row, idField);
		byExactId.set(exact, row);
		const normalized = uuidKey(exact);
		if (!normalized || ambiguousUuids.has(normalized)) continue;
		const existing = byUuid.get(normalized);
		if (existing && rowId(existing, idField) !== exact) {
			byUuid.delete(normalized);
			ambiguousUuids.add(normalized);
			continue;
		}
		byUuid.set(normalized, row);
	}

	return ids.map((id) => {
		const exact = String(id);
		const row = byExactId.get(exact) ?? byUuid.get(uuidKey(id) ?? "");
		if (!row) {
			throw new BetterAuthError(
				`[# Drizzle Adapter]: createMany could not read back inserted "${model}" row ${String(id)}.`,
			);
		}
		return row;
	});
}
