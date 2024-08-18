import { z, ZodSchema } from "zod";
import { FieldAttribute } from "../db";

export function toZodSchema(fields: Record<string, FieldAttribute>) {
	const schema = z.object({
		...Object.keys(fields).reduce((acc, key) => {
			const field = fields[key];
			if (!field) {
				return acc;
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
