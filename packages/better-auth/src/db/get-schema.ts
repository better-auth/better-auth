import { getAuthTables, type FieldAttribute, type BetterAuthDbSchema } from ".";
import type { BetterAuthOptions } from "../types";
import { z } from "zod/v4";
import { BetterAuthError } from "../error";

export const $dbSchema = z.object({
	id: z.string().optional(),
	fields: z.record(
		z.string(),
		z.object({
			type: z.string(),
			fieldName: z.string().optional(),
			references: z
				.object({
					model: z.string(),
					field: z.string(),
				})
				.optional(),
		}),
	),
	modelName: z.string(),
	order: z.union([z.number(), z.literal(Infinity)]).optional(),
	disableMigrations: z.boolean().optional(),
});

export function getSchema(config: BetterAuthOptions) {
	const tables = getAuthTables(config);
	let schema: BetterAuthDbSchema = {};
	for (const key in tables) {
		const table = tables[key];
		const fields = table.fields;
		let actualFields: Record<string, FieldAttribute> = {};
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
			modelName: table.modelName,
		};
		const { error } = $dbSchema.safeParse(schema[table.modelName]);
		if (error) {
			throw new BetterAuthError(error.message || "Schema validation failed");
		}
	}
	return schema;
}
