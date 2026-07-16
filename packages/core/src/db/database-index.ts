import { BetterAuthError } from "../error";
import type { DBFieldAttribute, DBTableIndex } from "./type";

const MAX_DATABASE_INDEX_NAME_BYTES = 63;
const MAX_DATABASE_INDEX_FIELDS = 16;

export function getPortableDatabaseIdentifierKey(identifier: string) {
	return identifier.toLowerCase();
}

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

/** A table-level index resolved to physical database columns. */
export interface ResolvedDBTableIndex extends Omit<DBTableIndex, "fields"> {
	/** Physical database column names, in index order. */
	columns: readonly [string, ...string[]];
	name: string;
}

export interface DBTableIndexSource {
	fields: Readonly<Record<string, DBFieldAttribute>>;
	indexes: readonly DBTableIndex[] | undefined;
	tableName: string;
}

export type BoundedDatabaseIndexDialect = "mssql" | "mysql";

/** Returns the stable database name for a table-level index. */
export function getDatabaseIndexName(
	tableName: string,
	index: DBTableIndex,
): string {
	if (index.name !== undefined) {
		if (index.name.trim().length === 0) {
			throw new BetterAuthError(
				"Database index names must contain at least one visible character.",
			);
		}
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(index.name)) {
			throw new BetterAuthError(
				"Database index names must start with a letter or underscore and contain only letters, numbers, and underscores.",
			);
		}
		if (getUtf8ByteLength(index.name) > MAX_DATABASE_INDEX_NAME_BYTES) {
			throw new BetterAuthError(
				`Database index names must be at most ${MAX_DATABASE_INDEX_NAME_BYTES} UTF-8 bytes.`,
			);
		}
		return index.name;
	}

	const indexKind = index.unique ? "uidx" : "idx";
	const generatedName = `${tableName}_${index.fields.join("_")}_${indexKind}`;
	if (getUtf8ByteLength(generatedName) <= MAX_DATABASE_INDEX_NAME_BYTES) {
		return generatedName;
	}

	const suffix = `_${getStableIndexNameHash(generatedName)}_${indexKind}`;
	return `${truncateUtf8(
		generatedName.slice(0, -indexKind.length - 1),
		MAX_DATABASE_INDEX_NAME_BYTES - getUtf8ByteLength(suffix),
	)}${suffix}`;
}

/** Returns the database name used by legacy field-level index metadata. */
export function getDatabaseFieldIndexName(
	tableName: string,
	columnName: string,
	unique: boolean,
) {
	return getDatabaseIndexName(tableName, {
		fields: [columnName],
		unique,
	});
}

/** Resolves logical index fields to their configured database column names. */
export function resolveDatabaseTableIndexes({
	fields,
	indexes,
	tableName,
}: {
	fields: Readonly<Record<string, DBFieldAttribute>>;
	indexes: readonly DBTableIndex[] | undefined;
	tableName: string;
}): readonly ResolvedDBTableIndex[] {
	const resolvedIndexes = (indexes ?? []).map((index) => {
		if (index.fields.length === 0) {
			throw new BetterAuthError(
				`Index on table "${tableName}" must include at least one field.`,
			);
		}
		if (index.fields.length > MAX_DATABASE_INDEX_FIELDS) {
			throw new BetterAuthError(
				`Index on table "${tableName}" can include at most ${MAX_DATABASE_INDEX_FIELDS} fields so it works across supported databases.`,
			);
		}
		if (new Set(index.fields).size !== index.fields.length) {
			throw new BetterAuthError(
				`Index on table "${tableName}" contains the same field more than once.`,
			);
		}
		if (
			index.unique &&
			index.fields.some((fieldName) => fields[fieldName]?.required === false)
		) {
			throw new BetterAuthError(
				`Unique index on table "${tableName}" can only include required fields so its behavior is consistent across databases.`,
			);
		}
		const unsupportedField = index.fields.find((fieldName) => {
			const fieldType = fields[fieldName]?.type;
			return (
				fieldType === "json" ||
				fieldType === "string[]" ||
				fieldType === "number[]"
			);
		});
		if (unsupportedField) {
			throw new BetterAuthError(
				`Index on table "${tableName}" references field "${unsupportedField}", whose type is not portably indexable.`,
			);
		}
		const resolveFieldName = (fieldName: string) => {
			const field = fields[fieldName];
			if (!field) {
				throw new BetterAuthError(
					`Index on table "${tableName}" references unknown field "${fieldName}".`,
				);
			}
			return field.fieldName || fieldName;
		};
		const [firstField, ...remainingFields] = index.fields;
		const columns = [
			resolveFieldName(firstField),
			...remainingFields.map(resolveFieldName),
		] as ResolvedDBTableIndex["columns"];
		if (
			new Set(columns.map(getPortableDatabaseIdentifierKey)).size !==
			columns.length
		) {
			throw new BetterAuthError(
				`Index on table "${tableName}" resolves more than one field to the same database column.`,
			);
		}

		return {
			columns,
			name: getDatabaseIndexName(tableName, {
				...index,
				fields: columns,
			}),
			unique: index.unique,
		} satisfies ResolvedDBTableIndex;
	});

	const definitionsByName = new Map<string, string>();
	const deduplicatedIndexes: ResolvedDBTableIndex[] = [];
	for (const index of resolvedIndexes) {
		const definition = JSON.stringify([index.columns, index.unique ?? false]);
		const identifierKey = getPortableDatabaseIdentifierKey(index.name);
		const existingDefinition = definitionsByName.get(identifierKey);
		if (existingDefinition && existingDefinition !== definition) {
			throw new BetterAuthError(
				`Database index name "${index.name}" identifies more than one index on table "${tableName}".`,
			);
		}
		if (existingDefinition) continue;
		definitionsByName.set(identifierKey, definition);
		deduplicatedIndexes.push(index);
	}
	return deduplicatedIndexes;
}

/**
 * Returns a safe generated string length for a column across all of its table
 * indexes in byte-limited SQL dialects.
 */
export function getDatabaseIndexStringLength({
	columnName,
	dialect,
	fields,
	indexes,
}: {
	columnName: string;
	dialect: BoundedDatabaseIndexDialect;
	fields: Readonly<Record<string, DBFieldAttribute>>;
	indexes: readonly ResolvedDBTableIndex[];
}): number | undefined {
	const fieldsByColumn = new Map(
		Object.entries(fields).map(([fieldName, field]) => [
			field.fieldName || fieldName,
			field,
		]),
	);
	const containingIndexes = indexes.filter((index) =>
		index.columns.includes(columnName),
	);
	if (containingIndexes.length === 0) return undefined;

	const byteBudget = dialect === "mysql" ? 3072 : 1700;
	const bytesPerCharacter = dialect === "mysql" ? 4 : 1;
	const defaultLength = dialect === "mysql" ? 191 : 255;
	return containingIndexes.reduce((length, index) => {
		const stringColumnCount = index.columns.filter((column) => {
			const type = fieldsByColumn.get(column)?.type;
			return type === "string" || Array.isArray(type);
		}).length;
		if (stringColumnCount === 0) return length;
		const nonStringColumnBytes =
			(index.columns.length - stringColumnCount) * 16;
		const safeLength = Math.floor(
			Math.max(1, byteBudget - nonStringColumnBytes) /
				bytesPerCharacter /
				stringColumnCount,
		);
		return Math.min(length, safeLength);
	}, defaultLength);
}

/**
 * Resolves and validates every table index as one portable database schema.
 *
 * Index names are schema-wide because SQLite and PostgreSQL do not scope them
 * to an individual table.
 */
export function resolveDatabaseSchemaIndexes(
	sources: readonly DBTableIndexSource[],
): ReadonlyMap<string, readonly ResolvedDBTableIndex[]> {
	const mergedSourcesByTable = new Map<
		string,
		{
			fields: Record<string, DBFieldAttribute>;
			indexes: DBTableIndex[];
			tableName: string;
		}
	>();
	for (const source of sources) {
		const existingSource = mergedSourcesByTable.get(source.tableName);
		if (existingSource) {
			if (
				existingSource.indexes.length > 0 ||
				(source.indexes?.length ?? 0) > 0
			) {
				throw new BetterAuthError(
					`Database schema resolves more than one indexed logical table to "${source.tableName}". Define table-level indexes through one logical schema key instead of aliasing multiple keys to the same database table.`,
				);
			}
			Object.assign(existingSource.fields, source.fields);
			continue;
		}
		const mergedSource: {
			fields: Record<string, DBFieldAttribute>;
			indexes: DBTableIndex[];
			tableName: string;
		} = {
			fields: {},
			indexes: [],
			tableName: source.tableName,
		};
		Object.assign(mergedSource.fields, source.fields);
		mergedSource.indexes.push(...(source.indexes ?? []));
		mergedSourcesByTable.set(source.tableName, mergedSource);
	}

	const indexesByTable = new Map<string, ResolvedDBTableIndex[]>();
	const indexOwnerByName = new Map<string, string>();
	const tableNamesByIdentifier = new Map(
		[...mergedSourcesByTable.keys()].map((tableName) => [
			getPortableDatabaseIdentifierKey(tableName),
			tableName,
		]),
	);
	const fieldIndexOwnerByName = new Map<string, string>();

	for (const source of mergedSourcesByTable.values()) {
		for (const [fieldName, field] of Object.entries(source.fields)) {
			if (!field.index && !field.unique) continue;
			const indexName = getDatabaseFieldIndexName(
				source.tableName,
				field.fieldName || fieldName,
				field.unique ?? false,
			);
			const identifierKey = getPortableDatabaseIdentifierKey(indexName);
			if (tableNamesByIdentifier.has(identifierKey)) {
				throw new BetterAuthError(
					`Database index name "${indexName}" conflicts with a table name. Index and table names must be unique across the schema.`,
				);
			}
			const existingOwner = fieldIndexOwnerByName.get(identifierKey);
			if (existingOwner) {
				throw new BetterAuthError(
					`Database field-level index name "${indexName}" is used by both table "${existingOwner}" and table "${source.tableName}".`,
				);
			}
			fieldIndexOwnerByName.set(identifierKey, source.tableName);
		}
	}

	for (const source of mergedSourcesByTable.values()) {
		const resolvedIndexes = resolveDatabaseTableIndexes(source);
		indexesByTable.set(source.tableName, [...resolvedIndexes]);

		for (const index of resolvedIndexes) {
			const identifierKey = getPortableDatabaseIdentifierKey(index.name);
			if (tableNamesByIdentifier.has(identifierKey)) {
				throw new BetterAuthError(
					`Database index name "${index.name}" conflicts with a table name. Index and table names must be unique across the schema.`,
				);
			}
			const fieldIndexOwner = fieldIndexOwnerByName.get(identifierKey);
			if (fieldIndexOwner) {
				throw new BetterAuthError(
					`Database index name "${index.name}" is already reserved by field-level index metadata on table "${fieldIndexOwner}". Remove the duplicate table-level index or give it a distinct name.`,
				);
			}
			const indexOwner = indexOwnerByName.get(identifierKey);
			if (indexOwner && indexOwner !== source.tableName) {
				throw new BetterAuthError(
					`Database index name "${index.name}" is used by both table "${indexOwner}" and table "${source.tableName}". Index names must be unique across the schema.`,
				);
			}
			indexOwnerByName.set(identifierKey, source.tableName);
		}
	}

	return indexesByTable;
}
