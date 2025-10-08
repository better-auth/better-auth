import type { BetterAuthOptions } from "./options";
import type {
	accountSchema,
	schema,
	sessionSchema,
	userSchema,
	verificationSchema,
} from "../db/schema";
import type { Auth } from "../auth";
import type { InferFieldsFromOptions, InferFieldsFromPlugins } from "../db";
import type {
	SchemaTypes,
	StripEmptyObjects,
	UnionToIntersection,
} from "./helper";
import type {
	AuthPluginSchema,
	AuthPluginTableSchema,
	BetterAuthPlugin,
} from "./plugins";

export type Models =
	| "user"
	| "account"
	| "session"
	| "verification"
	| "rate-limit"
	| "organization"
	| "member"
	| "invitation"
	| "jwks"
	| "passkey"
	| "two-factor";

export type AdditionalUserFieldsInput<
	Options extends BetterAuthOptions<S>,
	S extends AuthPluginSchema,
> = InferFieldsFromPlugins<Options, "user", S, "input"> &
	InferFieldsFromPlugins<Options, "user", S, "input"> &
	InferFieldsFromOptions<Options, "user", S, "input">;

export type AdditionalUserFieldsOutput<
	Options extends BetterAuthOptions<S>,
	S extends AuthPluginSchema,
> = InferFieldsFromPlugins<Options, "user", S> &
	InferFieldsFromOptions<Options, "user", S>;

export type AdditionalSessionFieldsInput<
	Options extends BetterAuthOptions<S>,
	S extends AuthPluginSchema,
> = InferFieldsFromPlugins<Options, "session", S, "input"> &
	InferFieldsFromOptions<Options, "session", S, "input">;

export type AdditionalSessionFieldsOutput<
	Options extends BetterAuthOptions<S>,
	S extends AuthPluginSchema,
> = InferFieldsFromPlugins<Options, "session", S> &
	InferFieldsFromOptions<Options, "session", S>;

export type InferUser<
	O extends BetterAuthOptions<S> | Auth<S>,
	S extends AuthPluginSchema<typeof schema>,
> = UnionToIntersection<
	StripEmptyObjects<
		S["user"] &
			(O extends BetterAuthOptions<S>
				? AdditionalUserFieldsOutput<O, S>
				: O extends Auth<S>
					? AdditionalUserFieldsOutput<O["options"], S>
					: {})
	>
>;

export type InferSession<
	O extends BetterAuthOptions<S> | Auth<S>,
	S extends AuthPluginSchema<typeof schema>,
> = UnionToIntersection<
	StripEmptyObjects<
		S["session"] &
			(O extends BetterAuthOptions<S>
				? AdditionalSessionFieldsOutput<O, S>
				: O extends Auth<S>
					? AdditionalSessionFieldsOutput<O["options"], S>
					: {})
	>
>;

export type InferPluginTypes<
	O extends BetterAuthOptions<S>,
	S extends AuthPluginSchema<typeof schema>,
> = O["plugins"] extends Array<infer P>
	? UnionToIntersection<
			P extends BetterAuthPlugin<S>
				? P["$Infer"] extends Record<string, any>
					? P["$Infer"]
					: {}
				: {}
		>
	: {};

interface RateLimit {
	/**
	 * The key to use for rate limiting
	 */
	key: string;
	/**
	 * The number of requests made
	 */
	count: number;
	/**
	 * The last request time in milliseconds
	 */
	lastRequest: number;
}

export type User = SchemaTypes<typeof userSchema>;
export type Account = SchemaTypes<typeof accountSchema>;
export type Session = SchemaTypes<typeof sessionSchema>;
export type Verification = SchemaTypes<typeof verificationSchema>;
export type { RateLimit };
