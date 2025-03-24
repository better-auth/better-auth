import type { FieldAttribute } from "../db";

export function withApplyDefault(
	value: any,
	field: FieldAttribute,
	action: "create" | "update",
	useNumberId: boolean = false,
) {
	if (useNumberId && field.references && field.references.field === "id") {
		return Number(value);
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
	return field.type === "string"
		? String(value)
		: field.type === "number"
			? Number(value)
			: value;
}
