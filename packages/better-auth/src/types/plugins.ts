import type { BetterAuthOptions, BetterAuthPlugin } from "@better-auth/core";

import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import type { UnionToIntersection } from "./helper";

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
	O["plugins"] extends Array<infer P>
		? UnionToIntersection<
				P extends BetterAuthPlugin
					? P["$ERROR_CODES"] extends Record<string, any>
						? P["$ERROR_CODES"]
						: {}
					: {}
			>
		: {};
