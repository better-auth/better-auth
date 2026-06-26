import type { BetterAuthOptions } from "@better-auth/core";
import type { DBFieldAttribute } from "@better-auth/core/db";
import { getAuthTables } from "@better-auth/core/db";

export function getSchema(config: BetterAuthOptions) {
	const tables = getAuthTables(config);
	const schema: Record<
		string,
		{
			fields: Record<string, DBFieldAttribute>;
			order: number;
			disableMigrations?: boolean | undefined;
		}
	> = {};
	for (const key in tables) {
		const table = tables[key]!;
		const fields = table.fields;
		const actualFields: Record<string, DBFieldAttribute> = {};
		Object.entries(fields).forEach(([key, field]) => {
			actualFields[field.fieldName || key] = field;
			if (field.references) {
				const refTable = tables[field.references.model];
				if (refTable) {
					actualFields[field.fieldName || key]!.references = {
						...field.references,
						model: refTable.modelName,
						field: field.references.field,
					};
				}
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
	return schema;
}
