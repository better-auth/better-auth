import type { LiteralString } from "../../types/helper";
import type { AuthorizeResponse, createAccessControl } from "./access";

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

export type ResourceRequest<TActionType> =
	| TActionType
	| { actions: TActionType; connector: "OR" | "AND" };

export type AuthorizeRequest<TStatements extends Statements> = {
	[P in keyof TStatements]?: ResourceRequest<TStatements[P]>;
};

export type Role<TStatements extends Statements = Statements> = {
	authorize: (
		request: AuthorizeRequest<TStatements>,
		connector?: "OR" | "AND",
	) => AuthorizeResponse<typeof request>;
	statements: TStatements;
};
