import type { ZodSchema } from "zod";

export type FieldAttribute<T extends FieldType = FieldType> = {
	type: T;
} & FieldAttributeConfig<T>;

export type FieldType = "string" | "number" | "boolean" | "date";

export type InferValueType<T extends FieldType> = T extends "string"
	? string
	: T extends "number"
		? number
		: T extends "boolean"
			? boolean
			: T extends "date"
				? Date
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
	defaultValue?: InferValueType<T> | (() => InferValueType<T>);
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
	/**
	 * The name of the field on the database.
	 * default: the key in the fields object.
	 */
	fieldName?: string;
};

export type PluginFieldAttribute = Omit<
	FieldAttribute,
	"transform" | "defaultValue" | "hashValue"
>;
