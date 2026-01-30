import type { BetterAuthOptions, BetterAuthPlugin } from "@better-auth/core";
import type { InferFieldsFromOptions, InferFieldsFromPlugins } from "../db";
import type { UnionToIntersection } from "./helper";

export type AdditionalUserFieldsInput<Options extends BetterAuthOptions> =
	InferFieldsFromPlugins<Options, "user", "input"> &
		InferFieldsFromOptions<Options, "user", "input">;

export type AdditionalSessionFieldsInput<Options extends BetterAuthOptions> =
	InferFieldsFromPlugins<Options, "session", "input"> &
		InferFieldsFromOptions<Options, "session", "input">;

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
