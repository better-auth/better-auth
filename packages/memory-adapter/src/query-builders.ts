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
		return (recordVal as string)?.includes(value as string) ?? false;
	}
	return recordVal.toLowerCase().includes(value.toLowerCase());
}

export function insensitiveStartsWith(
	recordVal: unknown,
	value: unknown,
): boolean {
	if (typeof recordVal !== "string" || typeof value !== "string") {
		return (recordVal as string)?.startsWith(value as string) ?? false;
	}
	return recordVal.toLowerCase().startsWith(value.toLowerCase());
}

export function insensitiveEndsWith(
	recordVal: unknown,
	value: unknown,
): boolean {
	if (typeof recordVal !== "string" || typeof value !== "string") {
		return (recordVal as string)?.endsWith(value as string) ?? false;
	}
	return recordVal.toLowerCase().endsWith(value.toLowerCase());
}
