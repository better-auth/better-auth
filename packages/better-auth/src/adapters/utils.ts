import type { FieldAttribute } from "../db";

export function withApplyDefault(
	value: any,
	field: FieldAttribute,
	action: "create" | "update",
	useNumberId: boolean,
) {
	if (field.references && field.references.field === "id") {
		if (useNumberId && value) {
			return Number(value);
		}
	}
	if (action === "update") {
		return value;
	}
	if (value === undefined || value === null) {
		if (field.defaultValue) {
			if (typeof field.defaultValue === "function") {
				return field.defaultValue();
			}
			return field.defaultValue;
		}
	}
	return value;
}
