import type { UnionToIntersection } from "./helper";

import type { BetterAuthPluginDBSchema, DBFieldAttribute } from "@better-auth/core/db";
import type { BetterAuthOptions, BetterAuthPlugin } from "@better-auth/core";

export type InferOptionSchema<S extends BetterAuthPluginDBSchema> =
	S extends Record<string, { fields: infer Fields }>
		? {
				[K in keyof S]?: {
					modelName?: string;
					fields?: {
						[P in keyof Fields]?: string | Partial<DBFieldAttribute>;
					};
				};
			}
		: never;

export type InferPluginErrorCodes<O extends BetterAuthOptions> =
	O["plugins"] extends Array<infer P>
		? UnionToIntersection<
				P extends BetterAuthPlugin
					? P["$ERROR_CODES"] extends Record<string, any>
						? P["$ERROR_CODES"]
						: {}
					: {}
			>
		: {};
