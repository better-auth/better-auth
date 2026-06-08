import type { LiteralString } from "@better-auth/core";
import type { AuthorizeResponse, createAccessControl } from "./access";

export type ArrayElement<T> = T extends readonly (infer E)[] ? E : never;

export type SubArray<T extends unknown[] | readonly unknown[] | any[]> =
	| T[number][]
	| ReadonlyArray<T[number]>;

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

export type RoleStatements<TStatements extends Statements> = {
	readonly [P in keyof TStatements]?: SubArray<TStatements[P]>;
};

export type RoleInput<
	TStatements extends Statements,
	TRoleStatements extends Statements,
> = TRoleStatements &
	(string extends keyof TRoleStatements
		? {}
		: RoleStatements<TStatements> &
				Record<Exclude<keyof TRoleStatements, keyof TStatements>, never>);

export type ExactRoleStatements<TStatements extends Statements> = {
	readonly [P in keyof TStatements]: readonly [...TStatements[P]];
};

export type AccessControl<TStatements extends Statements = Statements> =
	ReturnType<typeof createAccessControl<TStatements>>;

export type RoleAuthorizeRequest<TStatements extends Statements> = {
	[P in keyof TStatements]?:
		| SubArray<TStatements[P]>
		| {
				actions: SubArray<TStatements[P]>;
				connector: "OR" | "AND";
		  };
};

export type Role<
	TRoleStatements extends Statements = Record<string, any>,
	TAuthorizeStatements extends Statements = TRoleStatements,
> = {
	authorize: (
		request: RoleAuthorizeRequest<TAuthorizeStatements>,
		connector?: ("OR" | "AND") | undefined,
	) => AuthorizeResponse;
	statements: TRoleStatements;
};
