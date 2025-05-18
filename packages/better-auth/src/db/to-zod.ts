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
			if (field.type === "decimal") {
				return {
					...acc,
					[key]: z
						.number()
						// in the refine I am comparing the number with EPSILON
						// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/EPSILON
						.refine((x) => x * 100 - Math.trunc(x * 100) < Number.EPSILON)
						.parse(0.1 + 0.1 + 0.1),
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
