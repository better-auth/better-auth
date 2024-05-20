export type UnionToIntersection<U> = (
	U extends any
		? (k: U) => void
		: never
) extends (k: infer I) => void
	? I
	: never;

export type InferType<
	T extends "string" | "number" | "email" | "date" | "boolean",
> = T extends "string"
	? string
	: T extends "number"
		? number
		: T extends "boolean"
			? boolean
			: T extends "email"
				? string
				: T extends "date"
					? Date
					: boolean;

export type Flatten<T> = T extends object ? { [K in keyof T]: T[K] } : never;

export type FlattenKeys<T, P extends string | number = ""> = {
	[key in keyof T]: key extends string | number
		? T[key] extends Record<string, any>
			? P extends ""
				? FlattenKeys<T[key], `${key}`>
				: FlattenKeys<T[key], `${P}.${key}`>
			: P extends ""
				? `${key}`
				: `${P}.${key}`
		: never;
}[keyof T];

type NonOptionalKeys<T> = {
	[K in keyof T]: T extends Record<K, T[K]>
		? undefined extends T[K]
			? never
			: K
		: never;
}[keyof T];

export type PickNonOptional<T> = Pick<T, NonOptionalKeys<T>>;
