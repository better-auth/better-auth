import { Context, Endpoint } from "better-call";
import { CamelCase, HasRequiredKeys, UnionToIntersection } from "type-fest";
import { Prettify } from "../types/helper";
import { BetterAuth } from "../auth";

type Ctx<C extends Context<any, any>> = (C["body"] | {}) &
	(C["params"] extends Record<string, any>
		? {
			params: C["params"];
		}
		: {}) &
	(C["query"] extends Record<string, any>
		? {
			query: C["query"];
		}
		: {});

type Options<API extends Record<string, any>> = API extends {
	[key: string]: infer T;
}
	? T extends Endpoint
	? {
		[key in InferKeys<T["path"]>]: T extends (ctx: infer C) => infer R
		? C extends Context<any, any>
		? (
			...data: HasRequiredKeys<Ctx<C>> extends true
				? [Ctx<C>]
				: [Ctx<C>?]
		) => R
		: never
		: never;
	}
	: {}
	: {};

type InferKeys<T> = T extends `/${infer A}/${infer B}`
	? CamelCase<`${A}-${InferKeys<B>}`>
	: T extends `${infer I}/:${infer _}`
	? I
	: T extends `${infer I}:${infer _}`
	? I
	: T;

export type O<Auth extends BetterAuth = BetterAuth> = Omit<
	Prettify<UnionToIntersection<Options<Auth>>>,
	"signinOauth" | "signUpOauth" | "callback"
>;
