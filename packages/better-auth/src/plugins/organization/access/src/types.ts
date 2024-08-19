import { LiteralString } from "../../../../types/helper";

// Transforms an array into any combination of 0 or more of its members
export type SubArray<T extends unknown[]> = T[number][];

// Defines a subset similar to Partial, but keys are not optional
// instead they are either present or not
export type Subset<K extends keyof R, R extends Record<string, string[]>> = {
	[P in K]: SubArray<R[P]>;
};

export type StatementsPrimitive = {
	readonly [resource: string]: readonly LiteralString[]; //| undefined
};
