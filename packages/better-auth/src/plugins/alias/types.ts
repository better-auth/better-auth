import type { CamelCase } from "../../client/path-to-object";

export type NormalizePrefix<S extends string> = S extends ""
	? ""
	: S extends "/"
		? ""
		: S extends `/${infer Rest}`
			? Rest extends `${infer Inner}/`
				? `/${Inner}`
				: `/${Rest}`
			: S extends `${infer Inner}/`
				? `/${Inner}`
				: `/${S}`;

export type TransformNormalizedPrefix<T extends string> =
	T extends `${infer Head}/${infer Tail}`
		? `${Head}-${TransformNormalizedPrefix<Tail>}`
		: T;

type TrimLeadingChar<
	S extends string,
	C extends string = "-",
> = S extends `${C}${infer T}` ? T : S;
export type TransformEndpointKey<
	K extends string,
	Prefix extends string,
> = `${CamelCase<`${TrimLeadingChar<TransformNormalizedPrefix<NormalizePrefix<Prefix>>>}`>}${Capitalize<K>}`;
