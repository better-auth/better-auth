import { BetterAuthError } from "../../error";

export function finitePositiveInt(
	value: number | undefined,
): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
		return undefined;
	}
	return Math.floor(value);
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

/**
 * Restore input order after an unordered insert/read-back (for example
 * MySQL `IN (...)` or SQL Server `OUTPUT`). Adapters that preserve insert
 * order should return driver rows as-is instead.
 */
export function orderRowsByIds<T extends Record<string, unknown>>(
	ids: unknown[],
	rows: T[],
	idField: string,
	model: string,
): T[] {
	const byId = new Map<string, T>();
	for (const row of rows) {
		byId.set(String(row[idField] ?? row.id), row);
	}
	return ids.map((id) => {
		const row = byId.get(String(id));
		if (!row) {
			throw new BetterAuthError(
				`Adapter createMany could not read back inserted "${model}" row ${String(id)}.`,
			);
		}
		return row;
	});
}
