import { BetterFetchOption, BetterFetchResponse } from "@better-fetch/fetch";
import { Context, Endpoint } from "better-call";
import {
	HasRequiredKeys,
	Prettify,
	UnionToIntersection,
} from "../types/helper";

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

type InferCtx<C extends Context<any, any>> = C["body"] extends Record<
	string,
	any
>
	? C["body"] & {
			options?: BetterFetchOption<undefined, C["query"], C["params"]>;
		}
	: C["query"] extends Record<string, any>
		? {
				query: C["query"];
				options?: Omit<
					BetterFetchOption<C["body"], C["query"], C["params"]>,
					"query"
				>;
			}
		: {
				options?: BetterFetchOption<C["body"], C["query"], C["params"]>;
			};

type MergeRoutes<T> = UnionToIntersection<T>;
type InferRoute<API> = API extends {
	[key: string]: infer T;
}
	? T extends Endpoint
		? T["options"]["metadata"] extends {
				onClient: "hide";
			}
			? {}
			: PathToObject<
					T["path"],
					T extends (ctx: infer C) => infer R
						? C extends Context<any, any>
							? (
									...data: HasRequiredKeys<InferCtx<C>> extends true
										? [Prettify<InferCtx<C>>]
										: [Prettify<InferCtx<C>>?]
								) => Promise<BetterFetchResponse<Awaited<R>>>
							: never
						: never
				>
		: never
	: never;
export type InferRoutes<API extends Record<string, Endpoint>> = MergeRoutes<
	InferRoute<API>
>;

export interface ProxyRequest {
	options?: BetterFetchOption<any, any>;
	query?: any;
	[key: string]: any;
}
