import type { DBFieldAttribute } from "@better-auth/core/db";

export function convertToDB<T extends Record<string, any>>(
	fields: Record<string, DBFieldAttribute>,
	values: T,
) {
	let result: Record<string, any> = values.id
		? {
				id: values.id,
			}
		: {};
	for (const key in fields) {
		const field = fields[key]!;
		const value = values[key];
		if (value === undefined) {
			continue;
		}
		result[field.fieldName || key] = value;
	}
	return result as T;
}

export function convertFromDB<T extends Record<string, any>>(
	fields: Record<string, DBFieldAttribute>,
	values: T | null,
) {
	if (!values) {
		return null;
	}
	let result: Record<string, any> = {
		id: values.id,
	};
	for (const [key, value] of Object.entries(fields)) {
		result[key] = values[value.fieldName || key];
	}
	return result as T;
}
