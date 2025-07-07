import type { ZodSchema } from "zod";
import type { BetterAuthOptions } from "../types";
import type { LiteralString } from "../types/helper";

export type FieldType =
	| "string"
	| "number"
	| "boolean"
	| "date"
	| `${"string" | "number"}[]`
	| Array<LiteralString>;

type Primitive =
	| string
	| number
	| boolean
	| Date
	| null
	| undefined
	| string[]
	| number[];

export type FieldAttributeConfig<T extends FieldType = FieldType> = {
	/**
	 * If the field should be required on a new record.
	 * @default true
	 */
	required?: boolean;
	/**
	 * If the value should be returned on a response body.
	 * @default true
	 */
	returned?: boolean;
	/**
	 * If a value should be provided when creating a new record.
	 * @default true
	 */
	input?: boolean;
	/**
	 * Default value for the field
	 *
	 * Note: This will not create a default value on the database level. It will only
	 * be used when creating a new record.
	 */
	defaultValue?: Primitive | (() => Primitive);
	/**
	 * transform the value before storing it.
	 */
	transform?: {
		input?: (value: Primitive) => Primitive | Promise<Primitive>;
		output?: (value: Primitive) => Primitive | Promise<Primitive>;
	};
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
	 * If the field should be a bigint on the database instead of integer.
	 */
	bigint?: boolean;
	/**
	 * A zod schema to validate the value.
	 */
	validator?: {
		input?: ZodSchema;
		output?: ZodSchema;
	};
	/**
	 * The name of the field on the database.
	 */
	fieldName?: string;
	/**
	 * If the field should be sortable.
	 *
	 * applicable only for `text` type.
	 * It's useful to mark fields varchar instead of text.
	 */
	sortable?: boolean;
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
			: T extends "date"
				? Date
				: T extends `${infer T}[]`
					? T extends "string"
						? string[]
						: number[]
					: T extends Array<any>
						? T[number]
						: never;

export type InferFieldsOutput<Field> = Field extends Record<
	infer Key,
	FieldAttribute
>
	? {
			[key in Key as Field[key]["required"] extends false
				? Field[key]["defaultValue"] extends boolean | string | number | Date
					? key
					: never
				: key]: InferFieldOutput<Field[key]>;
		} & {
			[key in Key as Field[key]["returned"] extends false
				? never
				: key]?: InferFieldOutput<Field[key]> | null;
		}
	: {};

export type InferFieldsInput<Field> = Field extends Record<
	infer Key,
	FieldAttribute
>
	? {
			[key in Key as Field[key]["required"] extends false
				? never
				: Field[key]["defaultValue"] extends string | number | boolean | Date
					? never
					: Field[key]["input"] extends false
						? never
						: key]: InferFieldInput<Field[key]>;
		} & {
			[key in Key as Field[key]["input"] extends false ? never : key]?:
				| InferFieldInput<Field[key]>
				| undefined
				| null;
		}
	: {};

/**
 * For client will add "?" on optional fields
 */
export type InferFieldsInputClient<Field> = Field extends Record<
	infer Key,
	FieldAttribute
>
	? {
			[key in Key as Field[key]["required"] extends false
				? never
				: Field[key]["defaultValue"] extends string | number | boolean | Date
					? never
					: Field[key]["input"] extends false
						? never
						: key]: InferFieldInput<Field[key]>;
		} & {
			[key in Key as Field[key]["input"] extends false
				? never
				: Field[key]["required"] extends false
					? key
					: Field[key]["defaultValue"] extends string | number | boolean | Date
						? key
						: never]?: InferFieldInput<Field[key]> | undefined | null;
		}
	: {};

type InferFieldOutput<T extends FieldAttribute> = T["returned"] extends false
	? never
	: T["required"] extends false
		? InferValueType<T["type"]> | undefined | null
		: InferValueType<T["type"]>;

type InferFieldInput<T extends FieldAttribute> = InferValueType<T["type"]>;

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
