import { BetterAuthError } from "../../error";

export type IncrementManyWhereClause = {
	field: string;
	value: unknown;
	operator: string;
	connector: string;
	mode: string;
};

export type IncrementManyRow = {
	where: IncrementManyWhereClause[];
};

function isAdapterId(value: unknown): value is string | number {
	return typeof value === "string" || typeof value === "number";
}

/**
 * Each `incrementMany` row must pin exactly one record by a case-sensitive
 * `id` equality. Extra clauses are the rest of the guard.
 */
export function findSensitiveIdEq(
	where: IncrementManyWhereClause[],
	idField: string,
): IncrementManyWhereClause & { value: string | number } {
	const matches = where.filter(
		(clause) =>
			clause.field === idField &&
			clause.operator === "eq" &&
			clause.mode === "sensitive" &&
			clause.connector === "AND" &&
			isAdapterId(clause.value),
	);
	const match = matches[0];
	if (!match || matches.length !== 1 || !isAdapterId(match.value)) {
		throw new BetterAuthError(
			"incrementMany requires each row `where` to include exactly one case-sensitive `id` equality. Extra clauses are the rest of the guard.",
		);
	}
	return { ...match, value: match.value };
}

export function compareAdapterIds(
	left: string | number,
	right: string | number,
) {
	if (typeof left === "number" && typeof right === "number") {
		return left - right;
	}
	const leftKey = String(left);
	const rightKey = String(right);
	if (leftKey < rightKey) return -1;
	if (leftKey > rightKey) return 1;
	return 0;
}

export function assertUniqueIncrementManyIds(
	rows: readonly IncrementManyRow[],
	idField: string,
): void {
	const seen = new Set<string>();
	for (const row of rows) {
		const key = String(findSensitiveIdEq(row.where, idField).value);
		if (seen.has(key)) {
			throw new BetterAuthError(
				"incrementMany does not allow duplicate ids in `rows`.",
			);
		}
		seen.add(key);
	}
}

export function sortIncrementManyRows<T extends IncrementManyRow>(
	rows: readonly T[],
	idField: string,
): T[] {
	return rows
		.slice()
		.sort((left, right) =>
			compareAdapterIds(
				findSensitiveIdEq(left.where, idField).value,
				findSensitiveIdEq(right.where, idField).value,
			),
		);
}

export function finitePositiveInt(
	value: number | undefined,
): number | undefined {
	if (value === undefined || !Number.isFinite(value) || value < 1) {
		return undefined;
	}
	return Math.floor(value);
}

function whereBindCount(where: IncrementManyWhereClause[]): number {
	let count = 0;
	for (const clause of where) {
		if (Array.isArray(clause.value)) {
			count += clause.value.length;
		} else if (clause.value !== null) {
			count += 1;
		}
	}
	return Math.max(1, count);
}

export function incrementManyAssignmentBinds(
	increment: Record<string, number>,
	set?: Record<string, unknown> | undefined,
): number {
	return Object.keys(increment).length + Object.keys(set ?? {}).length;
}

function nonNegativeInt(value: number | undefined): number {
	if (value === undefined || !Number.isFinite(value) || value < 0) {
		return 0;
	}
	return Math.floor(value);
}

/**
 * Split rows so each statement stays at or below the database bind and row
 * caps. Assignment binds (`increment` deltas and `set` values) are subtracted
 * first: SQLite's 999-variable limit with `(id, revision)` plus one increment
 * is 499 rows (`499 * 2 + 1`), and plus an extra `set` is 498.
 */
export function chunkIncrementManyRows<T extends IncrementManyRow>(
	rows: readonly T[],
	options: {
		maxParameters?: number | undefined;
		maxRows?: number | undefined;
		assignmentBinds?: number | undefined;
	},
): T[][] {
	if (rows.length === 0) return [];
	const maxParameters = finitePositiveInt(options.maxParameters) ?? 999;
	const maxRows = finitePositiveInt(options.maxRows);
	const assignmentBinds = nonNegativeInt(options.assignmentBinds);
	let bindsPerRow = 1;
	for (const row of rows) {
		const count = whereBindCount(row.where);
		if (count > bindsPerRow) bindsPerRow = count;
	}
	const bindsPerStatement = assignmentBinds + bindsPerRow;
	if (maxParameters < bindsPerStatement) {
		throw new BetterAuthError(
			`incrementMany cannot fit a row under maxParameters=${maxParameters}: a single-row statement needs ${bindsPerStatement} binds (${assignmentBinds} assignment + ${bindsPerRow} per row).`,
		);
	}
	const parameterChunkSize = Math.floor(
		(maxParameters - assignmentBinds) / bindsPerRow,
	);
	const chunkSize = Math.max(
		1,
		maxRows === undefined
			? parameterChunkSize
			: Math.min(parameterChunkSize, maxRows),
	);
	const chunks: T[][] = [];
	for (let offset = 0; offset < rows.length; offset += chunkSize) {
		chunks.push(rows.slice(offset, offset + chunkSize));
	}
	return chunks;
}
