import type { BetterAuthOptions } from "@better-auth/core";
import type {
	DBFieldAttribute,
	DBFieldAttributeConfig,
	DBFieldType,
} from "@better-auth/core/db";

export const createFieldAttribute = <
	T extends DBFieldType,
	C extends DBFieldAttributeConfig,
>(
	type: T,
	config?: C | undefined,
) => {
	return {
		type,
		...config,
	} satisfies DBFieldAttribute<T>;
};

export type InferValueType<T extends DBFieldType> = T extends "string"
	? string
	: T extends "number"
		? number
		: T extends "boolean"
			? boolean
			: T extends "date"
				? Date
				: T extends "json"
					? Record<string, any>
					: T extends `${infer U}[]`
						? U extends "string"
							? string[]
							: number[]
						: T extends Array<any>
							? T[number]
							: never;

export type InferFieldsOutput<Field> =
	Field extends Record<infer Key, DBFieldAttribute>
		? {
				[key in Key as Field[key]["returned"] extends false
					? never
					: Field[key]["required"] extends false
						? Field[key]["defaultValue"] extends
								| boolean
								| string
								| number
								| Date
							? key
							: never
						: key]: InferFieldOutput<Field[key]>;
			} & {
				[key in Key as Field[key]["returned"] extends false
					? never
					: Field[key]["required"] extends false
						? Field[key]["defaultValue"] extends
								| boolean
								| string
								| number
								| Date
							? never
							: key
						: never]?: InferFieldOutput<Field[key]> | null;
			}
		: {};

export type InferFieldsInput<Field> =
	Field extends Record<infer Key, DBFieldAttribute>
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
export type InferFieldsInputClient<Field> =
	Field extends Record<infer Key, DBFieldAttribute>
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
						: Field[key]["defaultValue"] extends
									| string
									| number
									| boolean
									| Date
							? key
							: never]?: InferFieldInput<Field[key]> | undefined | null;
			}
		: {};

type InferFieldOutput<T extends DBFieldAttribute> = T["returned"] extends false
	? never
	: T["required"] extends false
		? InferValueType<T["type"]> | undefined | null
		: InferValueType<T["type"]>;

/**
 * Converts a Record<string, DBFieldAttribute> to an object type
 * with keys and value types inferred from DBFieldAttribute["type"].
 */
export type FieldAttributeToObject<
	Fields extends Record<string, DBFieldAttribute>,
> = AddOptionalFields<
	{
		[K in keyof Fields]: InferValueType<Fields[K]["type"]>;
	},
	Fields
>;

type AddOptionalFields<
	T extends Record<string, any>,
	Fields extends Record<keyof T, DBFieldAttribute>,
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
		schema?:
			| {
					[key in SchemaName]?: {
						additionalFields?: Record<string, DBFieldAttribute>;
					};
			  }
			| undefined;
	},
	isClientSide extends boolean = true,
> = Options["schema"] extends {
	[key in SchemaName]?: {
		additionalFields: infer Field extends Record<string, DBFieldAttribute>;
	};
}
	? isClientSide extends true
		? FieldAttributeToObject<RemoveFieldsWithInputFalse<Field>>
		: FieldAttributeToObject<Field>
	: {};

type RemoveFieldsWithInputFalse<T extends Record<string, DBFieldAttribute>> = {
	[K in keyof T as T[K]["input"] extends false ? never : K]: T[K];
};

type InferFieldInput<T extends DBFieldAttribute> = InferValueType<T["type"]>;

export type PluginFieldAttribute = Omit<
	DBFieldAttribute,
	"transform" | "defaultValue" | "hashValue"
>;

export type InferFieldsFromPlugins<
	Options extends BetterAuthOptions,
	Key extends string,
	Format extends "output" | "input",
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
	Options extends BetterAuthOptions,
	Key extends "session" | "user",
	Format extends "output" | "input",
> = Options[Key] extends {
	additionalFields: infer Field;
}
	? Format extends "output"
		? InferFieldsOutput<Field>
		: InferFieldsInput<Field>
	: {};
