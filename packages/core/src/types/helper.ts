type Primitive = string | number | symbol | bigint | boolean | null | undefined;

export type LiteralString = "" | (string & Record<never, never>);
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
