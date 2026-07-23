import type { DBFieldAttribute } from "./types";

const MAX_DATABASE_INDEX_NAME_BYTES = 63;

function getUtf8ByteLength(value: string) {
	return new TextEncoder().encode(value).length;
}

function truncateUtf8(value: string, maxBytes: number) {
	let result = "";
	let byteLength = 0;
	for (const character of value) {
		const characterByteLength = getUtf8ByteLength(character);
		if (byteLength + characterByteLength > maxBytes) break;
		result += character;
		byteLength += characterByteLength;
	}
	return result;
}

function getStableIndexNameHash(value: string) {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

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
		return typeMap[type as keyof typeof typeMap]!;
	};
}

export function filterForeignKeys({ fields }: { fields: DBFieldAttribute[] }) {
	return fields.filter(({ references }) => !!references);
}

export function filterNonUniqueIndexes({
	fields,
}: {
	fields: DBFieldAttribute[];
}) {
	return fields.filter(({ index, unique }) => !!index && !unique);
}

export function getIndexName(tableName: string, field: DBFieldAttribute) {
	const generatedName = `${tableName}_${field.fieldName}_idx`;
	if (getUtf8ByteLength(generatedName) <= MAX_DATABASE_INDEX_NAME_BYTES) {
		return generatedName;
	}

	const suffix = `_${getStableIndexNameHash(generatedName)}_idx`;
	return `${truncateUtf8(
		`${tableName}_${field.fieldName}`,
		MAX_DATABASE_INDEX_NAME_BYTES - getUtf8ByteLength(suffix),
	)}${suffix}`;
}

export function capitalize(str: string) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}
