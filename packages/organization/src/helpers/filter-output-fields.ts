import type { DBFieldAttribute } from "@better-auth/core/db";

/**
 * Filters output data by removing fields with `returned: false` attribute.
 * This ensures sensitive fields are not exposed in API responses.
 */
export function filterOutputFields<T extends Record<string, unknown> | null>(
	data: T,
	additionalFields: Record<string, DBFieldAttribute> | undefined,
): T extends null ? null : T {
	type Result = T extends null ? null : T;
	if (!data || !additionalFields) {
		return data as Result;
	}
	const returnFiltered = Object.entries(additionalFields)
		.filter(([, { returned }]) => returned === false)
		.map(([key]) => key);
	return Object.entries(structuredClone(data))
		.filter(([key]) => !returnFiltered.includes(key))
		.reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {} as Result);
}
