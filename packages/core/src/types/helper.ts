export type Primitive =
	| string
	| number
	| symbol
	| bigint
	| boolean
	| null
	| undefined;

export type Awaitable<T> = T | Promise<T>;
export type LiteralString = "" | (string & Record<never, never>);
export type LiteralUnion<LiteralType, BaseType extends Primitive> =
	| LiteralType
	| (BaseType & Record<never, never>);

export type Prettify<T> = {
	[K in keyof T]: T[K];
} & {};

export type UnionToIntersection<U> = (
	U extends any
		? (k: U) => void
		: never
) extends (k: infer I) => void
	? I
	: never;

export type WithEnabled<T extends Record<string, unknown>> = T & {
	enabled?: boolean | undefined;
};
