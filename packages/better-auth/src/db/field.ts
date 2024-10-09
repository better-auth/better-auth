import type { ZodSchema } from "zod";

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

export type FieldAttribute<T extends FieldType = FieldType> = {
	type: T;
} & FieldAttributeConfig<T>;

export type FieldType =
	| "string"
	| "number"
	| "boolean"
	| "date"
	| `${"string" | "number"}[]`;

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

export type InferFieldOutput<T extends FieldAttribute> =
	T["returned"] extends false
		? never
		: T["required"] extends false
			? InferValueType<T["type"]> | undefined
			: InferValueType<T["type"]>;

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

export type PluginFieldAttribute = Omit<
	FieldAttribute,
	"transform" | "defaultValue" | "hashValue"
>;
