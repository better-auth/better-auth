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

type CamelCase<S extends string> =
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

type InferSignUpEmailCtx<ClientOpts extends ClientOptions> = {
	email: string;
	name: string;
	password: string;
	image?: string;
	callbackURL?: string;
	fetchOptions?: BetterFetchOption<any, any, any>;
} & UnionToIntersection<InferAdditionalFromClient<ClientOpts, "user", "input">>;

type InferUserUpdateCtx<ClientOpts extends ClientOptions> = {
	image?: string;
	name?: string;
	fetchOptions?: BetterFetchOption<any, any, any>;
} & Partial<
	UnionToIntersection<InferAdditionalFromClient<ClientOpts, "user", "input">>
>;

type InferCtx<C extends Context<any, any>> = C["body"] extends Record<
	string,
	any
>
	? C["body"] & {
			fetchOptions?: BetterFetchOption<undefined, C["query"], C["params"]>;
		}
	: C["query"] extends Record<string, any>
		? {
				query: C["query"];
				fetchOptions?: Omit<
					BetterFetchOption<C["body"], C["query"], C["params"]>,
					"query"
				>;
			}
		: {
				fetchOptions?: BetterFetchOption<C["body"], C["query"], C["params"]>;
			};

type MergeRoutes<T> = UnionToIntersection<T>;

type InferReturn<R, O extends ClientOptions> = R extends Record<string, any>
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

export type InferRoute<API, COpts extends ClientOptions> = API extends {
	[key: string]: infer T;
}
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
							? (
									...data: HasRequiredKeys<InferCtx<C>> extends true
										? [
												Prettify<
													T["path"] extends `/sign-up/email`
														? InferSignUpEmailCtx<COpts>
														: InferCtx<C>
												>,
												BetterFetchOption<C["body"], C["query"], C["params"]>?,
											]
										: [
												Prettify<
													T["path"] extends `/update-user`
														? InferUserUpdateCtx<COpts>
														: InferCtx<C>
												>?,
												BetterFetchOption<C["body"], C["query"], C["params"]>?,
											]
								) => Promise<
									BetterFetchResponse<InferReturn<Awaited<R>, COpts>>
								>
							: never
						: never
				>
		: never
	: never;

export type InferRoutes<
	API extends Record<string, Endpoint>,
	ClientOpts extends ClientOptions,
> = MergeRoutes<InferRoute<API, ClientOpts>>;

export interface ProxyRequest {
	options?: BetterFetchOption<any, any>;
	query?: any;
	[key: string]: any;
}
