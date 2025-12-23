import type { LiteralString } from "@better-auth/core";
import type { AuthorizeResponse, createAccessControl } from "./access";

export type IsExactlyEmptyObject<T> = keyof T extends never // no keys
	? T extends {} // is assignable to {}
		? {} extends T
			? true
			: false // and {} is assignable to it
		: false
	: false;

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

export type Statements = {
	readonly [resource: string]: readonly LiteralString[];
};

export type AccessControl<TStatements extends Statements = Statements> =
	ReturnType<typeof createAccessControl<TStatements>>;

export type Role<TStatements extends Statements = Record<string, any>> = {
	authorize: (
		request: any,
		connector?: ("OR" | "AND") | undefined,
	) => AuthorizeResponse;
	statements: TStatements;
};
