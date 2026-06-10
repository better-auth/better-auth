export type IsAny<T> = 0 extends 1 & T ? true : false;

export type Prettify<T> = Omit<T, never>;

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

export type HasRequiredKeys<BaseType> =
	IsAny<BaseType> extends true
		? false
		: [BaseType] extends [object]
			? RequiredKeysOf<BaseType & object> extends never
				? false
				: true
			: false;

export type StripEmptyObjects<T extends object> = { [K in keyof T]: T[K] };

/**
 * Object merge replacing `Base`'s keys with `Override`'s.
 * The naive `Omit<Base, keyof Override> & Override` form breaks under generics.
 *
 * @see https://github.com/microsoft/TypeScript/issues/57466#issuecomment-1957988380
 */
export type OverrideMerge<Base, Override> = Base extends unknown
	? Override extends unknown
		? Prettify<
				{
					[K in keyof Base as K extends keyof Override ? never : K]: Base[K];
				} & Override
			>
		: never
	: never;

/**
 * Extracts a Record-typed field from a plugin, guarding against `any`.
 */
export type ExtractPluginField<T, Field extends string> =
	IsAny<T> extends true
		? {}
		: T extends { [K in Field]?: Record<string, any> }
			? T[Field] extends Record<string, any>
				? T[Field]
				: {}
			: {};

/**
 * Extracts a plugin ID while guarding against `any`.
 */
export type ExtractPluginID<T> =
	IsAny<T> extends true ? never : T extends { id: infer ID } ? ID : never;

/**
 * Walks a plugin tuple with tail-recursive accumulator (TS 4.5+),
 * extracting and intersecting the given field from each element.
 */
export type InferPluginFieldFromTuple<
	T extends readonly unknown[],
	Field extends string,
	Acc = {},
> = T extends readonly [infer Head, ...infer Tail]
	? InferPluginFieldFromTuple<
			Tail,
			Field,
			Acc & ExtractPluginField<Head, Field>
		>
	: Acc;

/**
 * Walks a plugin tuple and collects plugin IDs as a union.
 */
export type InferPluginIDsFromTuple<
	T extends readonly unknown[],
	Acc = never,
> = T extends readonly [infer Head, ...infer Tail]
	? InferPluginIDsFromTuple<Tail, Acc | ExtractPluginID<Head>>
	: Acc;
