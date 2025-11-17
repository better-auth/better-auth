import type { BetterAuthOptions, BetterAuthPlugin } from "@better-auth/core";
import type {
	BetterAuthPluginDBSchema,
	DBFieldAttribute,
} from "@better-auth/core/db";
import type { UnionToIntersection } from "./helper";

export type InferOptionSchema<S extends BetterAuthPluginDBSchema> = {
	[K in keyof S]?: {
		modelName?: string | undefined;
		fields?:
			| {
					[P in keyof S[K]["fields"]]?: string;
			  }
			| undefined;
		additionalFields?: Record<string, DBFieldAttribute> | undefined;
	};
};

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
