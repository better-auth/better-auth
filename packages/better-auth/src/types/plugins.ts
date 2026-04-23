import type {
	AuthContext,
	BetterAuthOptions,
	BetterAuthPlugin,
} from "@better-auth/core";

import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import type {
	ExtractPluginField,
	InferPluginFieldFromTuple,
	UnionToIntersection,
} from "./helper.js";

export type InferOptionSchema<S extends BetterAuthPluginDBSchema> =
	S extends Record<string, { fields: infer Fields }>
		? {
				[K in keyof S]?: {
					modelName?: string | undefined;
					fields?:
						| {
								[P in keyof Fields]?: string;
						  }
						| undefined;
				};
			}
		: never;

export type InferPluginErrorCodes<O extends BetterAuthOptions> =
	O["plugins"] extends readonly [unknown, ...unknown[]]
		? InferPluginFieldFromTuple<O["plugins"], "$ERROR_CODES">
		: O["plugins"] extends Array<infer P>
			? UnionToIntersection<ExtractPluginField<P, "$ERROR_CODES">>
			: {};

export type InferPluginIDs<O extends BetterAuthOptions> =
	O["plugins"] extends Array<infer P>
		? UnionToIntersection<P extends BetterAuthPlugin ? P["id"] : never>
		: never;

type ExtractInitContext<P extends BetterAuthPlugin> = P["init"] extends (
	...args: any[]
) => infer R
	? Awaited<R> extends { context?: infer C }
		? C extends Record<string, any>
			? Omit<C, keyof AuthContext>
			: {}
		: {}
	: {};

export type InferPluginContext<O extends BetterAuthOptions> =
	O["plugins"] extends Array<infer P>
		? UnionToIntersection<
				P extends BetterAuthPlugin ? ExtractInitContext<P> : {}
			>
		: {};
