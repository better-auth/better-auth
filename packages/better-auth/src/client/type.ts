import { Context, Endpoint } from "better-call";
import { CamelCase } from "type-fest";
import {
	Prettify,
	HasRequiredKeys,
	UnionToIntersection,
} from "../types/helper";

export type Ctx<C extends Context<any, any>> = Prettify<
	(C["body"] extends Record<string, any> ? C["body"] : {}) &
		(C["params"] extends Record<string, any>
			? {
					params: C["params"];
				}
			: {}) &
		(C["query"] extends Record<string, any>
			? {
					query: C["query"];
				}
			: {})
>;

export type InferKeys<T> = T extends `/${infer A}/${infer B}`
	? CamelCase<`${A}-${InferKeys<B>}`>
	: T extends `${infer I}/:${infer _}`
		? I
		: T extends `${infer I}:${infer _}`
			? I
			: T extends `/${infer I}`
				? I
				: T;

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
											? [Ctx<Prettify<C>>]
											: [Ctx<Prettify<C>>?]
									) => R
								: never
							: never;
					}
				: never
		>
	: never;
