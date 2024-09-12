import type { Primitive } from "zod";

export type LiteralString = "" | (string & Record<never, never>);

export type Prettify<T> = {
	[key in keyof T]: T[key];
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

type LastOf<T> = UnionToIntersection<
	T extends any ? () => T : never
> extends () => infer R
	? R
	: never;

type Push<T extends any[], V> = [...T, V];

type TuplifyUnion<
	T,
	L = LastOf<T>,
	N = [T] extends [never] ? true : false,
> = true extends N ? [] : Push<TuplifyUnion<Exclude<T, L>>, L>;

// The magic happens here!
export type Tuple<
	T,
	A extends T[] = [],
> = TuplifyUnion<T>["length"] extends A["length"]
	? [...A]
	: Tuple<T, [T, ...A]>;
