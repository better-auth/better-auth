import type { BetterAuthOptions, BetterAuthPlugin } from "@better-auth/core";
import type { Session, User } from "@better-auth/core/db";
import type { Auth } from "../auth";
import type { InferFieldsFromOptions, InferFieldsFromPlugins } from "../db";
import type { StripEmptyObjects, UnionToIntersection } from "./helper";

export type AdditionalUserFieldsInput<Options extends BetterAuthOptions> =
	InferFieldsFromPlugins<Options, "user", "input"> &
		InferFieldsFromOptions<Options, "user", "input">;

export type AdditionalUserFieldsOutput<Options extends BetterAuthOptions> =
	InferFieldsFromPlugins<Options, "user"> &
		InferFieldsFromOptions<Options, "user">;

export type AdditionalSessionFieldsInput<Options extends BetterAuthOptions> =
	InferFieldsFromPlugins<Options, "session", "input"> &
		InferFieldsFromOptions<Options, "session", "input">;

export type AdditionalSessionFieldsOutput<Options extends BetterAuthOptions> =
	InferFieldsFromPlugins<Options, "session"> &
		InferFieldsFromOptions<Options, "session">;

export type InferUser<O extends BetterAuthOptions | Auth> = UnionToIntersection<
	StripEmptyObjects<
		User &
			(O extends BetterAuthOptions
				? AdditionalUserFieldsOutput<O>
				: O extends Auth
					? AdditionalUserFieldsOutput<O["options"]>
					: {})
	>
>;

export type InferSession<O extends BetterAuthOptions | Auth> =
	UnionToIntersection<
		StripEmptyObjects<
			Session &
				(O extends BetterAuthOptions
					? AdditionalSessionFieldsOutput<O>
					: O extends Auth
						? AdditionalSessionFieldsOutput<O["options"]>
						: {})
		>
	>;

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
