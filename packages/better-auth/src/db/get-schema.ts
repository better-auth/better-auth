import type { BetterAuthOptions } from "@better-auth/core";
import type { DBFieldAttribute } from "@better-auth/core/db";
import { getAuthTables } from ".";

export function getSchema(config: BetterAuthOptions) {
	const tables = getAuthTables(config);
	let schema: Record<
		string,
		{
			fields: Record<string, DBFieldAttribute>;
			order: number;
		}
	> = {};
	for (const key in tables) {
		const table = tables[key]!;
		const fields = table.fields;
		let actualFields: Record<string, DBFieldAttribute> = {};
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
			continue;
		}
		schema[table.modelName] = {
			fields: actualFields,
			order: table.order || Infinity,
		};
	}
	return schema;
}
