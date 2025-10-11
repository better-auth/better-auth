import type { DBFieldAttribute } from "@better-auth/core/db";
import type { ZodType } from "zod";
import * as z from "zod";

export function toZodSchema<
	Fields extends Record<string, DBFieldAttribute | never>,
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

		let schema: ZodType;
		if (field.type === "json") {
			schema = (z as any).json ? (z as any).json() : z.any();
		} else if (field.type === "string[]" || field.type === "number[]") {
			schema = z.array(field.type === "string[]" ? z.string() : z.number());
		} else if (Array.isArray(field.type)) {
			schema = z.any();
		} else {
			schema = z[field.type]();
		}

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
	Field extends DBFieldAttribute | Record<string, never>,
	// if it's client side, then field attributes of `input` that are false should be removed
	isClientSide extends boolean = false,
> = Field extends { type: any }
	? GetInput<isClientSide, Field, GetRequired<Field, GetType<Field>>>
	: Record<string, never>;

type GetType<F extends DBFieldAttribute> = F extends {
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
	F extends DBFieldAttribute,
	Schema extends z.core.SomeType,
> = F extends {
	required: true;
}
	? Schema
	: z.ZodOptional<Schema>;

type GetInput<
	isClientSide extends boolean,
	Field extends DBFieldAttribute,
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
