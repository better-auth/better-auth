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
