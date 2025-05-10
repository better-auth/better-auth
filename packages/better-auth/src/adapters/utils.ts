import type { FieldAttribute } from "../db";

export async function withApplyDefault(
	value: any,
	field: FieldAttribute,
	action: "create" | "update",
) {
	if (action === "update") {
		return value;
	}
	if (value === undefined || value === null) {
		if (field.defaultValue) {
			if (typeof field.defaultValue === "function") {
				return await field.defaultValue();
			}
			return field.defaultValue;
		}
	}
	return value;
}
