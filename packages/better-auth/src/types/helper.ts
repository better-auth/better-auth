import type { AuthPluginSchema, AuthPluginTableSchema, BetterAuthPlugin } from ".";
import type { FieldPrimitive } from "../db";

export type Primitive =
	| string
	| number
	| symbol
	| bigint
	| boolean
	| null
	| undefined;

export type Required<S extends AuthPluginTableSchema, R extends boolean = true> = {
	[K in keyof S["fields"]]: S["fields"][K]["required"] extends R ? K : never;
}

export type MergePlugin<S1 extends AuthPluginSchema, P extends BetterAuthPlugin<S3>, S3 extends AuthPluginSchema> = {
	[K in keyof S1]: K extends keyof S3 ? {
		[F in keyof S1[K] | keyof S3[K]]: F extends keyof S3[K] ? S3[K][F] : F extends keyof S1[K] ? S1[K][F] : never;
	} : S1[K];
}

export type MergePlugins<S1 extends AuthPluginSchema, P extends BetterAuthPlugin<any>[]> = MergePlugin<S1, P[number], P[number] extends BetterAuthPlugin<infer S3> ? S3: never>;

export type MergeAdditionalFields<S1 extends AuthPluginSchema, M extends keyof S1, S2 extends Partial<S1[M]> & Record<string, any>> = {
	[K in keyof S1]: K extends M ? {
		[F in keyof S1[K] | keyof S2]: F extends keyof S2 ? S2[F] : F extends keyof S1[K] ? S1[K][F] : never;
	} : S1[K];
}

export type MergeSchema<S1 extends Record<any, any>, S2 extends Record<any, any> = {}> = {
  [K in keyof S1 | keyof S2]: K extends keyof S2 & keyof S1 ? S1[K] extends Record<any, any> ? S2[K] extends Record<any, any> ? MergeSchema<S1[K], S2[K]> : never : S2[K] : K extends keyof S1 ? S1[K] : K extends keyof S2 ? S2[K] : never;
}

export type SchemaTypes<S extends AuthPluginTableSchema> = {
  [K in keyof S["fields"]] : FieldPrimitive<S["fields"][K]["type"]>
}

export type RequiredOnly<S extends AuthPluginTableSchema> = {
	[K in keyof S["fields"]]: Ensure<S["fields"][K]["required"], true, S["fields"][K]>;
}

export type Ensure<T, U, R=T> = T extends U ? R : never;

export type EnsureAuthPluginSchema<T> = Ensure<T, AuthPluginTableSchema>;


export type LiteralString = "" | (string & Record<never, never>);
export type LiteralNumber = 0 | (number & Record<never, never>);

export type Awaitable<T> = Promise<T> | T;
export type OmitId<T extends { id: unknown }> = Omit<T, "id">;

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
export type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;
