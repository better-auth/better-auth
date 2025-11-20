import type { DBFieldAttribute } from "./types";

export function getTypeFactory(
	getTypeMap: (
		field: DBFieldAttribute,
	) => Record<
		"string" | "boolean" | "number" | "date" | "json" | "id" | "foreignKeyId",
		string
	> &
		Partial<Record<"string[]" | "number[]", string>>,
	config?: {
		/**
		 * @default "jsonb"
		 */
		arrayDataType?: "jsonb" | "text";
	},
) {
	return (field: DBFieldAttribute) => {
		const type = field.type;
		const typeMap = getTypeMap(field);
		if (field.fieldName === "id" || field.references?.field === "id") {
			if (field.fieldName === "id") {
				return typeMap.id;
			}
			return typeMap.foreignKeyId;
		}

		if (type === "string[]" || type === "number[]") {
			if (typeMap[type] !== undefined) {
				return typeMap[type];
			}
			return config?.arrayDataType ?? "jsonb";
		}
		if (Array.isArray(type)) {
			return "text";
		}
		return typeMap[type]!;
	};
}

export function filterForeignKeys({ fields }: { fields: DBFieldAttribute[] }) {
	return fields.filter(({ references }) => !!references);
}

export function capitalize(str: string) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}
