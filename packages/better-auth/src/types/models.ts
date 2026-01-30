import type { BetterAuthOptions, BetterAuthPlugin } from "@better-auth/core";
import type { InferDBFieldsFromOptions, InferDBFieldsFromPlugins } from "../db";
import type { UnionToIntersection } from "./helper";

export type AdditionalUserFieldsInput<Options extends BetterAuthOptions> =
	InferDBFieldsFromPlugins<Options, "user", "input"> &
		InferDBFieldsFromOptions<Options, "user", "input">;

export type AdditionalSessionFieldsInput<Options extends BetterAuthOptions> =
	InferDBFieldsFromPlugins<Options, "session", "input"> &
		InferDBFieldsFromOptions<Options, "session", "input">;

export type InferPluginTypes<O extends BetterAuthOptions> =
	O["plugins"] extends Array<infer P>
		? UnionToIntersection<
				P extends BetterAuthPlugin
					? P["$Infer"] extends Record<string, any>
						? P["$Infer"]
						: {}
					: {}
			>
		: {};

export type {
	Account,
	RateLimit,
	Session,
	User,
	Verification,
} from "@better-auth/core/db";
