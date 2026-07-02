import type { DBFieldAttribute } from "../type";

export function withApplyDefault(
	value: any,
	field: DBFieldAttribute,
	action: "create" | "update" | "findOne" | "findMany",
) {
	if (action === "update") {
		// Apply onUpdate if value is undefined
		if (value === undefined && field.onUpdate !== undefined) {
			if (typeof field.onUpdate === "function") {
				return field.onUpdate();
			}
			return field.onUpdate;
		}
		return value;
	}
	if (action === "create") {
		// we do not want to apply default values if the value is null & not required
		if (value === undefined || (field.required === true && value === null)) {
			if (field.defaultValue !== undefined) {
				if (typeof field.defaultValue === "function") {
					return field.defaultValue();
				}
				return field.defaultValue;
			}
		}
	}
	return value;
}

/**
 * Parses a value read back from an adapter into a `Date`.
 *
 * Adapters that don't natively return `Date` instances for `date`-typed
 * fields (or drivers/columns that hand back epoch milliseconds instead of an
 * ISO string) can return a `number`, or a `string` that is either an ISO
 * date or a numeric-millisecond value such as `"1774295570569"` or
 * `"1774295570569.0"`.
 *
 * A bare `new Date(value)` mis-parses the numeric-string case: the `Date`
 * constructor only recognizes ISO 8601 date strings, so a purely numeric
 * string is treated as an invalid ISO date and yields `Invalid Date` instead
 * of the intended timestamp.
 *
 * @see https://github.com/better-auth/better-auth/issues/9963
 */
export function parseDateValue(value: unknown): unknown {
	if (value instanceof Date) {
		return value;
	}
	if (typeof value === "number") {
		return new Date(value);
	}
	if (typeof value === "string") {
		const trimmed = value.trim();
		// A purely numeric string (optionally with a trailing fractional part,
		// e.g. "1774295570569" or "1774295570569.0") represents epoch
		// milliseconds, not an ISO date string.
		if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
			return new Date(Number(trimmed));
		}
		return new Date(value);
	}
	return value;
}

function isObject(item: unknown): item is Record<string, unknown> {
	return item !== null && typeof item === "object" && !Array.isArray(item);
}

export function deepmerge<T>(target: T, source: Partial<T>): T {
	if (Array.isArray(target) && Array.isArray(source)) {
		// merge arrays by concatenation
		return [...target, ...source] as T;
	} else if (isObject(target) && isObject(source)) {
		const result: Record<string, unknown> = { ...target };

		for (const [key, value] of Object.entries(source)) {
			if (value === undefined) continue; // skip undefined

			if (key in target) {
				result[key] = deepmerge(
					(target as Record<string, unknown>)[key],
					value as unknown as Partial<T>,
				);
			} else {
				result[key] = value;
			}
		}

		return result as T;
	}

	// primitives and fallback: source overrides target
	return source as T;
}
