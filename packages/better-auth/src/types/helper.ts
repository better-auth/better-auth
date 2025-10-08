import type {
	AuthPluginSchema,
	AuthPluginTableSchema,
	BetterAuthPlugin,
} from ".";
import type {
	field,
	FieldAttributeConfig,
	FieldAttributeFor,
	FieldPrimitive,
	FieldType,
	schema,
} from "../db";
import type { ZodType } from "zod";

export type Primitive =
	| string
	| number
	| symbol
	| bigint
	| boolean
	| null
	| undefined;

export type Output<S extends AuthPluginTableSchema> = {
	[K in keyof S["fields"]]: S["fields"][K]["returned"] extends true
		? S["fields"][K]
		: never;
};

export type Required<
	S extends AuthPluginTableSchema,
	R extends boolean = true,
> = {
	[K in keyof S]: K extends "fields"
		? {
				[K in keyof S["fields"]]: S["fields"][K]["required"] extends R
					? K
					: never;
			}
		: S[K];
};

export type MergePlugin<
	S1 extends AuthPluginSchema,
	S2 extends AuthPluginSchema,
> = {
	[K in keyof S1]: K extends keyof S2
		? {
				[F in keyof S1[K] | keyof S2[K]]: F extends keyof S2[K]
					? S2[K][F]
					: F extends keyof S1[K]
						? S1[K][F]
						: never;
			}
		: S1[K];
};

// export type MergePlugins<S1 extends AuthPluginSchema, P extends BetterAuthPlugin<S>[], S extends AuthPluginSchema> = MergePlugin<S1, S>;

export type MergeAdditionalFields<
	S1 extends AuthPluginSchema,
	M extends keyof S1,
	S2 extends Partial<S1[M]> & Record<string, any>,
> = {
	[K in keyof S1]: K extends M
		? {
				[F in keyof S1[K] | keyof S2]: F extends keyof S2
					? S2[F]
					: F extends keyof S1[K]
						? S1[K][F]
						: never;
			}
		: S1[K];
};

export type OmitCore<S extends AuthPluginTableSchema> = {
	[K in keyof S & string]: K extends "fields"
		? Omit<S[K], "id" | "createdAt" | "updatedAt">
		: S[K];
};

export type OmitSchemaCore<S extends AuthPluginSchema> = {
	[K in keyof S]: OmitCore<S[K]>;
};

type OptionalProp<S, K extends PropertyKey> = S extends { [P in K]?: infer V }
	? V | undefined
	: undefined;
type PreferSecond<S1, S2, K extends PropertyKey> = OptionalProp<
	S2,
	K
> extends undefined
	? OptionalProp<S1, K>
	: OptionalProp<S2, K>;

type MergeTransform<
	S1 extends FieldAttributeFor<any>["transform"],
	S2 extends Partial<FieldAttributeFor<any>["transform"]>,
> = S1 extends undefined
	? S2
	: S2 extends undefined
		? S1
		: {
				input?: PreferSecond<NonNullable<S1>, NonNullable<S2>, "input">;
				output?: PreferSecond<NonNullable<S1>, NonNullable<S2>, "output">;
			};

type MergeReference<
	S1 extends FieldAttributeFor<any>["references"],
	S2 extends Partial<FieldAttributeFor<any>["references"]>,
> = S1 extends undefined
	? S2
	: S2 extends undefined
		? S1
		: {
				model: PreferSecond<NonNullable<S1>, NonNullable<S2>, "model">;
				field: PreferSecond<NonNullable<S1>, NonNullable<S2>, "field">;
				onDelete?: PreferSecond<NonNullable<S1>, NonNullable<S2>, "onDelete">;
			};

type MergeValidator<
	S1 extends FieldAttributeFor<any>["validator"],
	S2 extends Partial<FieldAttributeFor<any>["validator"]>,
> = S1 extends undefined
	? S2
	: S2 extends undefined
		? S1
		: {
				input?: PreferSecond<NonNullable<S1>, NonNullable<S2>, "input">;
				output?: PreferSecond<NonNullable<S1>, NonNullable<S2>, "output">;
			};

type MergeField<
	S1 extends FieldAttributeFor<any>,
	S2 extends DeepPartial<FieldAttributeFor<any>>,
> = {
	type: S2["type"] extends undefined ? S1["type"] : S2["type"];
	required?: "required" extends keyof S2
		? S2["required"]
		: "required" extends keyof S1
			? S1["required"]
			: undefined;
	returned?: "returned" extends keyof S2
		? S2["returned"]
		: "returned" extends keyof S1
			? S1["returned"]
			: undefined;
	input?: "input" extends keyof S2
		? S2["input"]
		: "input" extends keyof S1
			? S1["input"]
			: undefined;
	defaultValue?: "defaultValue" extends keyof S2
		? S2["defaultValue"]
		: "defaultValue" extends keyof S1
			? S1["defaultValue"]
			: undefined;
	onUpdate?: "onUpdate" extends keyof S2
		? S2["onUpdate"]
		: "onUpdate" extends keyof S1
			? S1["onUpdate"]
			: undefined;
	transform?: MergeTransform<S1["transform"], S2["transform"]>;
	references?: MergeReference<S1["references"], S2["references"]>;
	unique?: "unique" extends keyof S2
		? S2["unique"]
		: "unique" extends keyof S1
			? S1["unique"]
			: undefined;
	bigint?: "bigint" extends keyof S2
		? S2["bigint"]
		: "bigint" extends keyof S1
			? S1["bigint"]
			: undefined;
	validator?: MergeValidator<
		S1["validator"],
		S2["validator"] extends { input?: ZodType; output?: ZodType }
			? S2["validator"]
			: never
	>;
	fieldName?: "fieldName" extends keyof S2
		? S2["fieldName"]
		: "fieldName" extends keyof S1
			? S1["fieldName"]
			: undefined;
	sortable?: "sortable" extends keyof S2
		? S2["sortable"]
		: "sortable" extends keyof S1
			? S1["sortable"]
			: undefined;
} & FieldAttributeFor<S2["type"] extends undefined ? S1["type"] : S2["type"]>;

type MergeFields<
	S1 extends AuthPluginTableSchema["fields"],
	S2 extends DeepPartial<AuthPluginTableSchema["fields"]> | undefined,
> = S2 extends undefined
	? S1
	: Ensure<
			{
				[F in keyof S1 | keyof S2]: F extends keyof S2 & keyof S1 & string
					? MergeField<
							S1[F],
							S2[F] extends FieldAttributeFor<any> ? S2[F] : never
						>
					: F extends keyof S1
						? S1[F]
						: F extends keyof S2
							? S2[F]
							: never;
			},
			AuthPluginTableSchema["fields"]
		>;

type MergeTable<
	T1 extends AuthPluginTableSchema,
	T2 extends DeepPartial<AuthPluginTableSchema>,
> = {
	fields: T2["fields"] extends undefined
		? T1["fields"]
		: MergeFields<T1["fields"], T2["fields"]>;
	disableMigration?: T2["disableMigration"] extends undefined
		? T1["disableMigration"]
		: T2["disableMigration"];
	modelName?: T2["modelName"] extends undefined
		? T1["modelName"]
		: T2["modelName"];
} & AuthPluginTableSchema;

type InferDefaultValue<T extends FieldAttributeFor<any>> =
	T["defaultValue"] extends undefined
		? never
		: T["defaultValue"] extends () => infer R
			? R
			: T["defaultValue"];

export type MergeSchema<
	S1 extends AuthPluginSchema,
	S2 extends GrandchildPartial<AuthPluginSchema>,
> = {
	[M in (keyof S1 & string) | (keyof S2 & string)]: M extends keyof S2
		? M extends keyof S1
			? MergeTable<S1[M] & AuthPluginTableSchema, S2[M]>
			: S2[M]
		: M extends keyof S1
			? S1[M]
			: never;
};

type SchemaTypesWrite<S extends AuthPluginTableSchema> =
	| {
			[K in keyof S["fields"]]?: S["fields"][K]["required"] extends false
				? FieldPrimitive<S["fields"][K]["type"]> | undefined | null
				: S["fields"][K]["defaultValue"] extends undefined
					? never
					: undefined | null | FieldPrimitive<S["fields"][K]["type"]>;
	  }
	| {
			[K in keyof S["fields"]]: S["fields"][K]["required"] extends false
				? never
				: S["fields"][K]["defaultValue"] extends undefined
					? FieldPrimitive<S["fields"][K]["type"]>
					: never;
	  };

type SchemaTypesRead<S extends AuthPluginTableSchema> = {
	[K in keyof S["fields"]]: FieldPrimitive<S["fields"][K]["type"]>;
};

export type SchemaTypes<
	S extends AuthPluginTableSchema,
	O extends boolean = false,
> = O extends true ? SchemaTypesWrite<S> : SchemaTypesRead<S>;

export type RequiredOnly<S extends AuthPluginTableSchema> = {
	[K in keyof S["fields"]]: Ensure<
		S["fields"][K]["required"],
		true,
		S["fields"][K]
	>;
};

export type Ensure<T, U, R = T> = T extends U ? R : never;

export type EnsureAuthPluginSchema<T> = Ensure<T, AuthPluginTableSchema>;

export type LiteralString = "" | (string & Record<never, never>);
export type LiteralNumber = 0 | (number & Record<never, never>);

export type Awaitable<T> = Promise<T> | T;
export type OmitId<T extends { id: unknown }> = Omit<T, "id">;
export type OmitSchemaId<
	S extends { [m in string]: { fields: { id: unknown } } },
> = {
	[M in keyof S]: {
		[K in keyof S[M]]: K extends "fields" ? OmitId<S[M]["fields"]> : S[M][K];
	};
};

export type OptionalId<
	T extends { [K in string]: FieldAttributeConfig & { type: any | unknown } },
> = "id" extends keyof T
	? {
			[K in keyof T]: K extends "id"
				? undefined | T[K] | FieldAttributeFor<"string" | "number">
				: T[K];
		}
	: T & { id: undefined | FieldAttributeFor<"string" | "number"> };
export type OptionalSchemaId<
	S extends { [m in string]: AuthPluginTableSchema },
> = {
	[M in keyof S]: {
		[K in keyof S[M]]: K extends "fields"
			? OptionalId<S[M]["fields"]>
			: S[M][K];
	};
};
export type Prettify<T> = Omit<T, never>;
export type PreserveJSDoc<T> = {
	[K in keyof T]: T[K];
} & {};
export type PrettifyDeep<T> = {
	[K in keyof T]: T[K] extends (...args: any[]) => any
		? T[K]
		: T[K] extends object
			? T[K] extends Array<any>
				? T[K]
				: T[K] extends Date
					? T[K]
					: PrettifyDeep<T[K]>
			: T[K];
} & {};
export type LiteralUnion<LiteralType, BaseType extends Primitive> =
	| LiteralType
	| (BaseType & Record<never, never>);

export type UnionToIntersection<U> = (
	U extends any
		? (k: U) => void
		: never
) extends (k: infer I) => void
	? I
	: never;

export type RequiredKeysOf<BaseType extends object> = Exclude<
	{
		[Key in keyof BaseType]: BaseType extends Record<Key, BaseType[Key]>
			? Key
			: never;
	}[keyof BaseType],
	undefined
>;

export type HasRequiredKeys<BaseType extends object> =
	RequiredKeysOf<BaseType> extends never ? false : true;
export type WithoutEmpty<T> = T extends T ? ({} extends T ? never : T) : never;

export type StripEmptyObjects<T> = T extends { [K in keyof T]: never }
	? never
	: T extends object
		? { [K in keyof T as T[K] extends never ? never : K]: T[K] }
		: T;
export type DeepPartial<T> = T extends Function
	? T
	: T extends object
		? { [K in keyof T]?: DeepPartial<T[K]> }
		: T;
export type ChildPartial<T extends object> = {
	[K in keyof T]: DeepPartial<T[K]>;
};
export type GrandchildPartial<T extends object> = {
	[K in keyof T]: T[K] extends object ? ChildPartial<T[K]> : T[K];
};
export type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;
