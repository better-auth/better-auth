import { type ZodSchema, z } from "zod";
import type { FieldAttribute } from ".";

export function toZodSchema(fields: Record<string, FieldAttribute>) {
	const schema = z.object({
		...Object.keys(fields).reduce((acc, key) => {
			const field = fields[key];
			if (!field) {
				return acc;
			}
			if (field.type === "string[]" || field.type === "number[]") {
				return {
					...acc,
					[key]: z.array(field.type === "string[]" ? z.string() : z.number()),
				};
			}
			if (Array.isArray(field.type)) {
				return {
					...acc,
					[key]: z.any(),
				};
			}
			let schema: ZodSchema = z[field.type]();
			if (field?.required === false) {
				schema = schema.optional();
			}
			if (field?.returned === false) {
				return acc;
			}
			return {
				...acc,
				[key]: schema,
			};
		}, {}),
	});
	return schema;
}
