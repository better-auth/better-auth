// Re-export shared types from core
export type {
	Prettify,
	PrettifyDeep,
	UnionToIntersection,
	StripEmptyObjects,
	LiteralUnion,
	HasRequiredKeys,
} from "@better-auth/core";

// Server-specific types
export type Primitive =
	| string
	| number
	| symbol
	| bigint
	| boolean
	| null
	| undefined;
export type LiteralString = "" | (string & Record<never, never>);
export type LiteralNumber = 0 | (number & Record<never, never>);

export type Awaitable<T> = Promise<T> | T;
export type OmitId<T extends { id: unknown }> = Omit<T, "id">;

export type PreserveJSDoc<T> = {
	[K in keyof T]: T[K];
} & {};

export type RequiredKeysOf<BaseType extends object> = Exclude<
	{
		[Key in keyof BaseType]: BaseType extends Record<Key, BaseType[Key]>
			? Key
			: never;
	}[keyof BaseType],
	undefined
>;

export type WithoutEmpty<T> = T extends T ? ({} extends T ? never : T) : never;
export type DeepPartial<T> = T extends Function
	? T
	: T extends object
		? { [K in keyof T]?: DeepPartial<T[K]> }
		: T;
export type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;
