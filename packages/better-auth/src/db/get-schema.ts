import { getAuthTables, type BetterAuthDbSchema, type FieldAttributeFor } from ".";
import type { AuthPluginSchema, BetterAuthOptions } from "../types";
import { schema } from "./schema";

export function getSchema<S extends AuthPluginSchema>(config: BetterAuthOptions<S>): BetterAuthDbSchema<S> {
	const tables = getAuthTables(config);
	// @ts-expect-error - It is populated further on
	let schema: BetterAuthDbSchema<S> = {};
	for (const key in tables) {
		const table = tables[key];
		const fields = table.fields;
		let actualFields: Record<string, FieldAttributeFor<any>> = {};
		Object.entries(fields).forEach(([key, field]) => {
			actualFields[field.fieldName || key] = field;
			if (field.references) {
				const refTable = tables[field.references.model];
				if (refTable) {
					actualFields[field.fieldName || key].references = {
						model: refTable.modelName,
						field: field.references.field,
					};
				}
			}
		});
		if (schema[table.modelName]) {
			schema[table.modelName].fields = {
				...schema[table.modelName].fields,
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
