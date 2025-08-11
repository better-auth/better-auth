import * as z from "zod/v4";
import type { ZodSchema } from "zod/v4";
import type { FieldAttribute } from ".";

export function toZodSchema<
	Fields extends Record<string, FieldAttribute | never>,
	IsClientSide extends boolean,
>({
	fields,
	isClientSide,
}: {
	fields: Fields;
	/**
	 * If true, then any fields that have `input: false` will be removed from the schema to prevent user input.
	 */
	isClientSide: IsClientSide;
}) {
	const zodFields = Object.keys(fields).reduce((acc, key) => {
		const field = fields[key];
		if (!field) {
			return acc;
		}
		if (isClientSide && field.input === false) {
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
	}, {});
	const schema = z.object(zodFields);
	return schema as z.ZodObject<
		RemoveNeverProps<{
			[key in keyof Fields]: FieldAttributeToSchema<Fields[key], IsClientSide>;
		}>,
		z.core.$strip
	>;
}

export type FieldAttributeToSchema<
	Field extends FieldAttribute | Record<string, never>,
	// if it's client side, then field attributes of `input` that are false should be removed
	isClientSide extends boolean = false,
> = Field extends { type: any }
	? GetInput<isClientSide, Field, GetRequired<Field, GetType<Field>>>
	: Record<string, never>;

type GetType<F extends FieldAttribute> = F extends {
	type: "string";
}
	? z.ZodString
	: F extends { type: "number" }
		? z.ZodNumber
		: F extends { type: "boolean" }
			? z.ZodBoolean
			: F extends { type: "date" }
				? z.ZodDate
				: z.ZodAny;

type GetRequired<
	F extends FieldAttribute,
	Schema extends z.core.SomeType,
> = F extends {
	required: true;
}
	? Schema
	: z.ZodOptional<Schema>;

type GetInput<
	isClientSide extends boolean,
	Field extends FieldAttribute,
	Schema extends z.core.SomeType,
> = Field extends {
	input: false;
}
	? isClientSide extends true
		? never
		: Schema
	: Schema;

type RemoveNeverProps<T> = {
	[K in keyof T as [T[K]] extends [never] ? never : K]: T[K];
};
