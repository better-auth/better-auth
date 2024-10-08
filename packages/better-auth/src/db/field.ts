import type { ZodSchema } from "zod";
import type { BetterAuthOptions } from "../types";

export type FieldType =
	| "string"
	| "number"
	| "boolean"
	| "date"
	| `${"string" | "number"}[]`;

export type FieldAttributeConfig<T extends FieldType = FieldType> = {
	/**
	 * If the field should be required on a new record.
	 * @default false
	 */
	required?: boolean;
	/**
	 * If the value should be returned on a response body.
	 * @default true
	 */
	returned?: boolean;
	/**
	 * If the value should be hashed when it's stored.
	 * @default false
	 */
	hashValue?: boolean;
	/**
	 * Default value for the field
	 *
	 * Note: This will not create a default value on the database level. It will only
	 * be used when creating a new record.
	 */
	defaultValue?: any;
	/**
	 * transform the value before storing it.
	 */
	transform?: (value: InferValueType<T>) => InferValueType<T>;
	/**
	 * Reference to another model.
	 */
	references?: {
		/**
		 * The model to reference.
		 */
		model: string;
		/**
		 * The field on the referenced model.
		 */
		field: string;
		/**
		 * The action to perform when the reference is deleted.
		 * @default "cascade"
		 */
		onDelete?:
			| "no action"
			| "restrict"
			| "cascade"
			| "set null"
			| "set default";
	};
	unique?: boolean;
	/**
	 * A zod schema to validate the value.
	 */
	validator?: ZodSchema;
};

export type FieldAttribute<T extends FieldType = FieldType> = {
	type: T;
} & FieldAttributeConfig<T>;

export const createFieldAttribute = <
	T extends FieldType,
	C extends Omit<FieldAttributeConfig<T>, "type">,
>(
	type: T,
	config?: C,
) => {
	return {
		type,
		...config,
	} satisfies FieldAttribute<T>;
};

export type InferValueType<T extends FieldType> = T extends "string"
	? string
	: T extends "number"
		? number
		: T extends "boolean"
			? boolean
			: T extends `${infer T}[]`
				? T extends "string"
					? string[]
					: number[]
				: never;

export type InferFieldsOutput<Field> = Field extends Record<
	infer Key,
	FieldAttribute
>
	? {
			[key in Key as Field[key]["required"] extends true
				? key
				: Field[key]["defaultValue"] extends any
					? key
					: never]: InferFieldOutput<Field[key]>;
		} & {
			[key in Key as Field[key]["returned"] extends false
				? never
				: key]?: InferFieldOutput<Field[key]>;
		}
	: {};

export type InferFieldsInput<Field> = Field extends Record<
	infer Key,
	FieldAttribute
>
	? {
			[key in Key as Field[key]["required"] extends true
				? key
				: Field[key]["defaultValue"] extends any
					? key
					: never]: InferFieldOutput<Field[key]>;
		} & {
			[key in Key]?: InferFieldOutput<Field[key]>;
		}
	: {};

type InferFieldOutput<T extends FieldAttribute> = T["returned"] extends false
	? never
	: T["required"] extends false
		? InferValueType<T["type"]> | undefined
		: InferValueType<T["type"]>;

export type PluginFieldAttribute = Omit<
	FieldAttribute,
	"transform" | "defaultValue" | "hashValue"
>;

export type InferFieldsFromPlugins<
	Options extends BetterAuthOptions,
	Key extends string,
	Format extends "output" | "input" = "output",
> = Options["plugins"] extends Array<infer T>
	? T extends {
			schema: {
				[key in Key]: {
					fields: infer Field;
				};
			};
		}
		? Format extends "output"
			? InferFieldsOutput<Field>
			: InferFieldsInput<Field>
		: {}
	: {};

export type InferFieldsFromOptions<
	Options extends BetterAuthOptions,
	Key extends "session" | "user",
	Format extends "output" | "input" = "output",
> = Options[Key] extends {
	additionalFields: infer Field;
}
	? Format extends "output"
		? InferFieldsOutput<Field>
		: InferFieldsInput<Field>
	: {};
