import type { DBFieldAttribute, InferDBValueType } from "@better-auth/core/db";

export type InferFieldsOutput<Fields extends Record<string, DBFieldAttribute>> =
	Fields extends Record<infer Key, DBFieldAttribute>
		? {
				[key in Key as Fields[key]["returned"] extends false
					? never
					: Fields[key]["required"] extends false
						? Fields[key]["defaultValue"] extends
								| boolean
								| string
								| number
								| Date
							? key
							: never
						: key]: InferFieldOutput<Fields[key]>;
			} & {
				[key in Key as Fields[key]["returned"] extends false
					? never
					: Fields[key]["required"] extends false
						? Fields[key]["defaultValue"] extends
								| boolean
								| string
								| number
								| Date
							? never
							: key
						: never]?: InferFieldOutput<Fields[key]> | null;
			}
		: never;

/**
 * For client will add "?" on optional fields
 */
export type InferFieldsInputClient<
	Fields extends Record<string, DBFieldAttribute>,
> =
	Fields extends Record<infer Key, DBFieldAttribute>
		? {
				[key in Key as Fields[key]["required"] extends false
					? never
					: Fields[key]["defaultValue"] extends string | number | boolean | Date
						? never
						: Fields[key]["input"] extends false
							? never
							: key]: InferFieldInput<Fields[key]>;
			} & {
				[key in Key as Fields[key]["input"] extends false
					? never
					: Fields[key]["required"] extends false
						? key
						: Fields[key]["defaultValue"] extends
									| string
									| number
									| boolean
									| Date
							? key
							: never]?: InferFieldInput<Fields[key]> | undefined | null;
			}
		: never;

type InferFieldOutput<T extends DBFieldAttribute> = T["returned"] extends false
	? never
	: T["required"] extends false
		? InferDBValueType<T["type"]> | undefined | null
		: InferDBValueType<T["type"]>;

/**
 * Converts a Record<string, DBFieldAttribute> to an object type
 * with keys and value types inferred from DBFieldAttribute["type"].
 */
export type FieldAttributeToObject<
	Fields extends Record<string, DBFieldAttribute>,
> = AddOptionalFields<
	{
		[K in keyof Fields]: InferDBValueType<Fields[K]["type"]>;
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
 *
 * @param isClientSide - When `true` (default), filters out `input: false` fields (clients can't send these).
 *   When `false`, includes all fields (for internal/server-side use).
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

export type RemoveFieldsWithReturnedFalse<
	T extends Record<string, DBFieldAttribute>,
> = {
	[K in keyof T as T[K]["returned"] extends false ? never : K]: T[K];
};

type InferFieldInput<T extends DBFieldAttribute> = InferDBValueType<T["type"]>;
