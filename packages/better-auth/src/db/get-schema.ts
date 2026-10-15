import type { BetterAuthOptions } from "@better-auth/core";
import type { DBFieldAttribute } from "@better-auth/core/db";
import type { ResolvedDBTableIndex } from "@better-auth/core/db/internal";
import { getAuthTablesWithResolvedIndexes } from "@better-auth/core/db/internal";

export function getSchema(config: BetterAuthOptions) {
	return buildSchema(config).schema;
}

/**
 * @internal
 */
export function buildSchema(config: BetterAuthOptions) {
	const { indexesByTable, tables } = getAuthTablesWithResolvedIndexes(config);
	const referenceKeys = new Map<
		DBFieldAttribute,
		{
			modelKey: string;
			fieldKey: string;
		}
	>();
	const schema: Record<
		string,
		{
			fields: Record<string, DBFieldAttribute>;
			indexes?: readonly ResolvedDBTableIndex[] | undefined;
			order: number;
			disableMigrations?: boolean | undefined;
		}
	> = {};
	for (const key in tables) {
		const table = tables[key]!;
		const fields = table.fields;
		const actualFields: Record<string, DBFieldAttribute> = {};
		Object.entries(fields).forEach(([key, field]) => {
			const reference = field.references;
			const refTable = reference ? tables[reference.model] : undefined;
			const actualField: DBFieldAttribute =
				reference && refTable
					? {
							...field,
							references: {
								...reference,
								model: refTable.modelName,
							},
						}
					: field;
			actualFields[field.fieldName || key] = actualField;
			if (reference) {
				referenceKeys.set(actualField, {
					modelKey: reference.model,
					fieldKey: reference.field,
				});
			}
		});
		if (schema[table.modelName]) {
			schema[table.modelName]!.fields = {
				...schema[table.modelName]!.fields,
				...actualFields,
			};
			if (table.disableMigrations) {
				schema[table.modelName]!.disableMigrations = true;
			}
			continue;
		}
		schema[table.modelName] = {
			fields: actualFields,
			order: table.order || Infinity,
			disableMigrations: table.disableMigrations,
		};
	}
	for (const [tableName, indexes] of indexesByTable) {
		if (schema[tableName]) {
			schema[tableName].indexes = indexes;
		}
	}

	return {
		schema,
		tables,
		referenceKeys,
	};
}
