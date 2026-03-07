import type {
	BetterAuthClientOptions,
	ClientFetchOption,
} from "@better-auth/core";
import type { BetterFetchResponse } from "@better-fetch/fetch";
import type { Endpoint, InputContext } from "better-call";
import type {
	HasRequiredKeys,
	Prettify,
	UnionToIntersection,
} from "../types/helper";
import type {
	InferAdditionalFromClient,
	InferSessionFromClient,
	InferUserFromClient,
} from "./types";

type KeepNullishFromOriginal<Original, Replaced> =
	| Replaced
	| (undefined extends Original ? undefined : never)
	| (null extends Original ? null : never);

type ReplaceTopLevelField<
	Data,
	Field extends "user" | "session",
	Replaced,
> = Data extends object
	? Field extends keyof Data
		? Omit<Data, Field> & {
				[K in Field]: KeepNullishFromOriginal<Data[K], Replaced>;
			}
		: Data
	: Data;

type ReplaceAuthUserAndSession<
	Data,
	ClientOpts extends BetterAuthClientOptions,
> = ReplaceTopLevelField<
	ReplaceTopLevelField<Data, "user", InferUserFromClient<ClientOpts>>,
	"session",
	InferSessionFromClient<ClientOpts>
>;

type RefineAuthResponse<
	Data,
	ClientOpts extends BetterAuthClientOptions,
> = Data extends { token: unknown } | { redirect: unknown }
	? // Only auth-like responses should get client-side user/session type refinement.
		ReplaceAuthUserAndSession<Data, ClientOpts>
	: Data;

export type CamelCase<S extends string> =
	S extends `${infer P1}-${infer P2}${infer P3}`
		? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<P3>}`
		: Lowercase<S>;

export type PathToObject<
	T extends string,
	Fn extends (...args: any[]) => any,
> = T extends `/${infer Segment}/${infer Rest}`
	? { [K in CamelCase<Segment>]: PathToObject<`/${Rest}`, Fn> }
	: T extends `/${infer Segment}`
		? { [K in CamelCase<Segment>]: Fn }
		: never;

export type InferSignUpEmailCtx<
	ClientOpts extends BetterAuthClientOptions,
	FetchOptions extends ClientFetchOption,
> = {
	email: string;
	name: string;
	password: string;
	image?: string | undefined;
	callbackURL?: string | undefined;
	fetchOptions?: FetchOptions | undefined;
} & UnionToIntersection<InferAdditionalFromClient<ClientOpts, "user", "input">>;

export type InferUserUpdateCtx<
	ClientOpts extends BetterAuthClientOptions,
	FetchOptions extends ClientFetchOption,
> = {
	image?: (string | null) | undefined;
	name?: string | undefined;
	fetchOptions?: FetchOptions | undefined;
} & Partial<
	UnionToIntersection<InferAdditionalFromClient<ClientOpts, "user", "input">>
>;

type InferCtxQuery<
	C extends InputContext<any, any, any, any, any, any>,
	FetchOptions extends ClientFetchOption,
> = 0 extends 1 & C["query"]
	? {
			query?: Record<string, any> | undefined;
			fetchOptions?: FetchOptions | undefined;
		}
	: [C["query"]] extends [Record<string, any>]
		? {
				query: C["query"];
				fetchOptions?: FetchOptions | undefined;
			}
		: [C["query"]] extends [Record<string, any> | undefined]
			? {
					query?: C["query"] | undefined;
					fetchOptions?: FetchOptions | undefined;
				}
			: {
					fetchOptions?: FetchOptions | undefined;
				};

export type InferCtx<
	C extends InputContext<any, any, any, any, any, any>,
	FetchOptions extends ClientFetchOption,
> = 0 extends 1 & C["body"]
	? // body is `any` — skip body intersection so fetchOptions stays typed
		InferCtxQuery<C, FetchOptions>
	: [C["body"]] extends [Record<string, any>]
		? C["body"] & {
				fetchOptions?: FetchOptions | undefined;
			}
		: InferCtxQuery<C, FetchOptions>;

export type MergeRoutes<T> = UnionToIntersection<T>;

export type InferRoute<API, COpts extends BetterAuthClientOptions> =
	API extends Record<string, infer T>
		? T extends Endpoint<
				any,
				any,
				any,
				any,
				any,
				infer R,
				infer Meta,
				infer ErrorSchema
			>
			? [Meta] extends [
					| {
							isAction: false;
					  }
					| {
							SERVER_ONLY: true;
					  }
					| {
							scope: "http";
					  }
					| {
							scope: "server";
					  },
				]
				? {}
				: PathToObject<
						T["path"],
						T extends (ctx: infer _C) => any
							? Extract<
									_C,
									InputContext<any, any, any, any, any, any>
								> extends infer C extends InputContext<
									any,
									any,
									any,
									any,
									any,
									any
								>
								? <
										FetchOptions extends ClientFetchOption<
											Partial<C["body"]> & Record<string, any>,
											Partial<C["query"]> & Record<string, any>,
											C["params"]
										>,
									>(
										...data: HasRequiredKeys<
											InferCtx<C, FetchOptions>
										> extends true
											? [
													Prettify<
														T["path"] extends `/sign-up/email`
															? InferSignUpEmailCtx<COpts, FetchOptions>
															: InferCtx<C, FetchOptions>
													>,
													FetchOptions?,
												]
											: [
													Prettify<
														T["path"] extends `/update-user`
															? InferUserUpdateCtx<COpts, FetchOptions>
															: InferCtx<C, FetchOptions>
													>?,
													FetchOptions?,
												]
									) => Promise<
										BetterFetchResponse<
											Meta extends {
												CUSTOM_SESSION: boolean;
											}
												? NonNullable<Awaited<R>>
												: T["path"] extends "/get-session"
													? {
															user: InferUserFromClient<COpts>;
															session: InferSessionFromClient<COpts>;
														} | null
													: RefineAuthResponse<NonNullable<Awaited<R>>, COpts>,
											0 extends 1 & ErrorSchema
												? {
														code?: string | undefined;
														message?: string | undefined;
													}
												: [ErrorSchema] extends [Record<string, any>]
													? ErrorSchema
													: {
															code?: string | undefined;
															message?: string | undefined;
														},
											FetchOptions["throw"] extends true
												? true
												: COpts["fetchOptions"] extends { throw: true }
													? true
													: false
										>
									>
								: never
							: never
					>
			: {}
		: never;

export type InferRoutes<
	API extends Record<string, unknown>,
	ClientOpts extends BetterAuthClientOptions,
> = MergeRoutes<InferRoute<API, ClientOpts>>;

export type ProxyRequest = {
	options?: ClientFetchOption<any, any> | undefined;
	query?: any | undefined;
	[key: string]: any;
};
