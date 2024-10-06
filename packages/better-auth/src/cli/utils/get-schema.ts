import { getAuthTables } from "../../db/get-tables";
import type { FieldAttribute } from "../../db";
import type { BetterAuthOptions } from "../../types";

export function getSchema(config: BetterAuthOptions) {
	const tables = getAuthTables(config);
	let schema: Record<
		string,
		{
			fields: Record<string, FieldAttribute>;
			order: number;
		}
	> = {};
	for (const key in tables) {
		const table = tables[key];
		const fields = table.fields;
		let actualFields: Record<string, FieldAttribute> = {};
		Object.entries(fields).forEach(([key, field]) => {
			actualFields[field.fieldName || key] = field;
		});
		if (schema[table.tableName]) {
			schema[table.tableName].fields = {
				...schema[table.tableName].fields,
				...actualFields,
			};
			continue;
		}
		schema[table.tableName] = {
			fields: actualFields,
			order: table.order || Infinity,
		};
	}
	return schema;
}
