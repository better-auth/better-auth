import type {
	BetterFetchOption,
	BetterFetchResponse,
} from "@better-fetch/fetch";
import type { Context, Endpoint } from "better-call";
import type {
	HasRequiredKeys,
	Prettify,
	StripEmptyObjects,
	UnionToIntersection,
} from "../types/helper";
import type {
	ClientOptions,
	InferAdditionalFromClient,
	InferSessionFromClient,
	InferUserFromClient,
} from "./types";

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
	ClientOpts extends ClientOptions,
	FetchOptions extends BetterFetchOption,
> = {
	email: string;
	name: string;
	password: string;
	image?: string;
	callbackURL?: string;
	fetchOptions?: FetchOptions;
} & UnionToIntersection<InferAdditionalFromClient<ClientOpts, "user", "input">>;

export type InferUserUpdateCtx<
	ClientOpts extends ClientOptions,
	FetchOptions extends BetterFetchOption,
> = {
	image?: string | null;
	name?: string;
	fetchOptions?: FetchOptions;
} & Partial<
	UnionToIntersection<InferAdditionalFromClient<ClientOpts, "user", "input">>
>;

export type InferCtx<
	C extends Context<any, any>,
	FetchOptions extends BetterFetchOption,
> = C["body"] extends Record<string, any>
	? C["body"] & {
			fetchOptions?: BetterFetchOption<undefined, C["query"], C["params"]>;
		}
	: C["query"] extends Record<string, any>
		? {
				query: C["query"];
				fetchOptions?: FetchOptions;
			}
		: C["query"] extends Record<string, any> | undefined
			? {
					query?: C["query"];
					fetchOptions?: FetchOptions;
				}
			: {
					fetchOptions?: FetchOptions;
				};

export type MergeRoutes<T> = UnionToIntersection<T>;

export type InferReturn<R, O extends ClientOptions> = R extends Record<
	string,
	any
>
	? StripEmptyObjects<
			{
				user: R extends { user: any } ? InferUserFromClient<O> : never;
				users: R extends { users: any[] } ? InferUserFromClient<O>[] : never;
				session: R extends { session: any } ? InferSessionFromClient<O> : never;
				sessions: R extends { sessions: any[] }
					? InferSessionFromClient<O>[]
					: never;
			} & {
				[key in Exclude<
					keyof R,
					"user" | "users" | "session" | "sessions"
				>]: R[key];
			}
		>
	: R;

export type InferRoute<API, COpts extends ClientOptions> = API extends Record<
	string,
	infer T
>
	? T extends Endpoint
		? T["options"]["metadata"] extends
				| {
						isAction: false;
				  }
				| {
						SERVER_ONLY: true;
				  }
			? {}
			: PathToObject<
					T["path"],
					T extends (ctx: infer C) => infer R
						? C extends Context<any, any>
							? <
									FetchOptions extends BetterFetchOption<
										C["body"],
										C["query"],
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
										T["options"]["metadata"] extends {
											CUSTOM_SESSION: boolean;
										}
											? NonNullable<Awaited<R>>
											: T["path"] extends "/get-session"
												? {
														user: InferUserFromClient<COpts>;
														session: InferSessionFromClient<COpts>;
													}
												: NonNullable<Awaited<R>>,
										{
											code?: string;
											message?: string;
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
	API extends Record<string, Endpoint>,
	ClientOpts extends ClientOptions,
> = MergeRoutes<InferRoute<API, ClientOpts>>;

export type ProxyRequest = {
	options?: BetterFetchOption<any, any>;
	query?: any;
	[key: string]: any;
};
