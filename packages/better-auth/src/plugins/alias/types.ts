type NormalizePrefix<S extends string> = S extends ""
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

type TransformNormalizedPrefix<T extends string> =
	T extends `${infer Head}/${infer Tail}`
		? `${Head}-${TransformNormalizedPrefix<Tail>}`
		: T;
