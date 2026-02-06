import type { BetterAuthOptions, BetterAuthPlugin } from "@better-auth/core";
import type {
	InferDBFieldsFromOptionsInput,
	InferDBFieldsFromPluginsInput,
} from "../db";
import type { UnionToIntersection } from "./helper";

export type AdditionalUserFieldsInput<Options extends BetterAuthOptions> =
	InferDBFieldsFromPluginsInput<"user", Options["plugins"]> &
		InferDBFieldsFromOptionsInput<Options["user"]>;

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
