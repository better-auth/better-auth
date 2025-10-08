import type { AuthPluginSchema, BetterAuthOptions, LiteralString } from "../types";
import { ZodType } from "zod";

export type FieldType =
	| "string"
	| "number"
	| "boolean"
	| "date"
	| "json"
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

export type FieldPrimitive<T extends FieldType> = T extends "string" ? string : T extends "number" ? number : T extends "boolean" ? boolean : T extends "date" ? Date : T extends "json" ? string : T extends "string[]" ? string[] : T extends "number[]" ? number[] : T extends Array<any> ? T[number] : never;
type Promiseable<T> = T | Promise<T>;

// TODO: Make P based on whether the field is required or not
export type FieldAttributeConfig<F extends FieldType = FieldType, P extends Primitive = FieldPrimitive<F>> = {
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
	defaultValue?: P | undefined | (() => P | undefined);
	/**
	 * Update value for the field
	 *
	 * Note: This will create an onUpdate trigger on the database level for supported adapters.
	 * It will be called when updating a record.
	 */
	onUpdate?: () => P;
	/**
	 * transform the value before storing it.
	 */
	transform?: {
		input?: (value: P) => Promiseable<P>;
		output?: (value: P) => Promiseable<P>;
	};
	/**
	 * Reference to another model.
	 */
	references?: {
		/**
		 * The model to reference.
		 */
		model: string
		/**
		 * The field on the referenced model.
		 */
		field: string
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
		input?:  ZodType;
		output?: ZodType;
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

export type FieldAttributeFor<
	T extends FieldType,
	> = {
		type: T;
	} & FieldAttributeConfig<T>

type DistributeFieldAttribute<T extends FieldType> = T extends FieldType
    ? FieldAttributeFor<T>
    : never;

export type FieldAttribute = DistributeFieldAttribute<FieldType>

/**
* For new uses, use the `field` function instead.
*/
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
	} as FieldAttributeFor<T>;
};

export const field = <
	T extends FieldType,
	C extends Omit<FieldAttributeConfig<T>, "type">,
>(
	type: T,
	config?: C,
) => {
	return {
		type,
		required: true,
		...config,
	} as FieldAttributeFor<T>;
};;

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
	FieldAttributeFor<any>
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

/**
 * Converts a Record<string, FieldAttribute> to an object type
 * with keys and value types inferred from FieldAttribute["type"].
 */
export type FieldAttributeToObject<
	Fields extends Record<string, FieldAttributeFor<any>>,
> = AddOptionalFields<
	{
		[K in keyof Fields]: InferValueType<Fields[K]["type"]>;
	},
	Fields
>;

type AddOptionalFields<
	T extends Record<string, any>,
	Fields extends Record<keyof T, FieldAttribute>,
> = {
	// Required fields: required === true
	[K in keyof T as Fields[K] extends { required: true } ? K : never]: T[K];
} & {
	// Optional fields: required !== true
	[K in keyof T as Fields[K] extends { required: true } ? never : K]?: T[K];
};

/**
 * Infer the additional fields from the plugin options.
 * For example, you can infer the additional fields of the org plugin's organization schema like this:
 * ```ts
 * type AdditionalFields = InferAdditionalFieldsFromPluginOptions<"organization", OrganizationOptions>
 * ```
 */
export type InferAdditionalFieldsFromPluginOptions<
	SchemaName extends string,
	Options extends {
		schema?: {
			[key in SchemaName]?: {
				additionalFields?: Record<string, FieldAttributeFor<any>>;
			};
		};
	},
	isClientSide extends boolean = true,
> = Options["schema"] extends {
	[key in SchemaName]?: {
		additionalFields: infer Field extends Record<string, FieldAttributeFor<any>>;
	};
}
	? isClientSide extends true
		? FieldAttributeToObject<RemoveFieldsWithInputFalse<Field>>
		: FieldAttributeToObject<Field>
	: {};

type RemoveFieldsWithInputFalse<T extends Record<string, FieldAttribute>> = {
	[K in keyof T as T[K]["input"] extends false ? never : K]: T[K];
};

type InferFieldInput<T extends FieldAttribute> = InferValueType<T["type"]>;

export type PluginFieldAttribute = Omit<
	FieldAttributeFor<any>,
	"transform" | "defaultValue" | "hashValue"
>;

export type InferFieldsFromPlugins<
	Options extends BetterAuthOptions<S>,
	Key extends string,
	S extends AuthPluginSchema,
	Format extends "output" | "input" = "output"
> = Options["plugins"] extends []
	? {}
	: Options["plugins"] extends Array<infer T>
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
	Options extends BetterAuthOptions<S>,
	Key extends "session" | "user",
	S extends AuthPluginSchema,
	Format extends "output" | "input" = "output",
> = Options[Key] extends {
	additionalFields: infer Field;
}
	? Format extends "output"
		? InferFieldsOutput<Field>
		: InferFieldsInput<Field>
	: {};
