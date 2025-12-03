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
