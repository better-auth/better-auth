import type { DBFieldAttribute } from "@better-auth/core/db";

export function withApplyDefault(
	value: any,
	field: DBFieldAttribute,
	action: "create" | "update",
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
	if (value === undefined || value === null) {
		if (field.defaultValue !== undefined) {
			if (typeof field.defaultValue === "function") {
				return field.defaultValue();
			}
			return field.defaultValue;
		}
	}
	return value;
}
