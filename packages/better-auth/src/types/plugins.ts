import type { BetterAuthOptions, BetterAuthPlugin } from "@better-auth/core";

import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import type { UnionToIntersection, EnabledPluginsFromOptions } from "./helper";

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
	UnionToIntersection<
		EnabledPluginsFromOptions<O> extends infer EP
			? EP extends BetterAuthPlugin
				? EP["$ERROR_CODES"] extends Record<string, any>
					? EP["$ERROR_CODES"]
					: {}
				: {}
			: {}
	>;
