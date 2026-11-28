/**
 * Case-insensitive in-memory comparison helpers.
 * Used when evaluating where clauses in the memory adapter.
 */

export function insensitiveCompare(a: unknown, b: unknown): boolean {
	if (typeof a === "string" && typeof b === "string") {
		return a.toLowerCase() === b.toLowerCase();
	}
	return a === b;
}

export function insensitiveIn(recordVal: unknown, values: unknown[]): boolean {
	if (typeof recordVal !== "string") return values.includes(recordVal);
	return values.some(
		(v) => typeof v === "string" && recordVal.toLowerCase() === v.toLowerCase(),
	);
}

export function insensitiveNotIn(
	recordVal: unknown,
	values: unknown[],
): boolean {
	return !insensitiveIn(recordVal, values);
}

export function insensitiveContains(
	recordVal: unknown,
	value: unknown,
): boolean {
	if (typeof recordVal !== "string" || typeof value !== "string") {
		return false;
	}
	return recordVal.toLowerCase().includes(value.toLowerCase());
}

export function insensitiveStartsWith(
	recordVal: unknown,
	value: unknown,
): boolean {
	if (typeof recordVal !== "string" || typeof value !== "string") {
		return false;
	}
	return recordVal.toLowerCase().startsWith(value.toLowerCase());
}

export function insensitiveEndsWith(
	recordVal: unknown,
	value: unknown,
): boolean {
	if (typeof recordVal !== "string" || typeof value !== "string") {
		return false;
	}
	return recordVal.toLowerCase().endsWith(value.toLowerCase());
}

/**
 * Strict equality, except that two `Date` values are equal when they are the
 * same instant. `===` compares dates by identity, so a stored date would never
 * match an equal date from a query.
 */
export function isSameValue(a: unknown, b: unknown): boolean {
	return (
		a === b ||
		(a instanceof Date && b instanceof Date && a.getTime() === b.getTime())
	);
}

export function includesValue(values: unknown[], recordVal: unknown): boolean {
	return (
		values.includes(recordVal) ||
		(recordVal instanceof Date && values.some((v) => isSameValue(v, recordVal)))
	);
}
