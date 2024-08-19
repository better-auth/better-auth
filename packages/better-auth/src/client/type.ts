import { Context, Endpoint } from "better-call";
import { CamelCase } from "type-fest";
import {
	Prettify,
	HasRequiredKeys,
	UnionToIntersection,
} from "../types/helper";
import { BetterFetchResponse } from "@better-fetch/fetch";

export type InferKeys<T> = T extends `/${infer A}/${infer B}`
	? CamelCase<`${A}-${InferKeys<B>}`>
	: T extends `${infer I}/:${infer _}`
		? I
		: T extends `${infer I}:${infer _}`
			? I
			: T extends `/${infer I}`
				? CamelCase<I>
				: CamelCase<T>;

export type InferActions<Actions> = Actions extends {
	[key: string]: infer T;
}
	? UnionToIntersection<
			T extends Endpoint
				? {
						[key in InferKeys<T["path"]>]: T extends (ctx: infer C) => infer R
							? C extends Context<any, any>
								? (
										...data: HasRequiredKeys<C> extends true
											? [Prettify<C>]
											: [Prettify<C>?]
									) => Promise<BetterFetchResponse<Awaited<R>>>
								: never
							: never;
					}
				: never
		>
	: never;
