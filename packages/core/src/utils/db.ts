import type { DBFieldAttribute } from "../db";

/**
 * Filters output data by removing fields with the `returned: false` attribute.
 * This ensures sensitive fields are not exposed in API responses.
 */
export function filterOutputFields<T extends Record<string, unknown> | null>(
	data: T,
	additionalFields: Record<string, DBFieldAttribute> | undefined,
): T {
	if (!data || !additionalFields) {
		return data;
	}
	const returnFiltered = Object.entries(additionalFields)
		.filter(([, { returned }]) => returned === false)
		.map(([key]) => key);
	return Object.entries(structuredClone(data))
		.filter(([key]) => !returnFiltered.includes(key))
		.reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {} as T);
}
