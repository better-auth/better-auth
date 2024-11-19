import type { LiteralString } from "../../../types/helper";

export type SubArray<T extends unknown[] | readonly unknown[] | any[]> =
	T[number][];

export type Subset<
	K extends keyof R,
	R extends Record<
		string | LiteralString,
		readonly string[] | readonly LiteralString[]
	>,
> = {
	[P in K]: SubArray<R[P]>;
};

export type StatementsPrimitive = {
	readonly [resource: string]: readonly LiteralString[];
};
