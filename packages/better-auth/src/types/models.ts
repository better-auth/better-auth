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
import type { SchemaTypes, StripEmptyObjects, UnionToIntersection } from "./helper";
import type { AuthPluginSchema, BetterAuthPlugin } from "./plugins";
import type * as z from "zod";

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

export type AdditionalUserFieldsInput<Options extends BetterAuthOptions<S>, S extends AuthPluginSchema> = InferFieldsFromPlugins<Options, "user", "input"> &
	InferFieldsFromPlugins<Options, "user", "input"> &
		InferFieldsFromOptions<Options, "user", "input">;

export type AdditionalUserFieldsOutput<Options extends BetterAuthOptions<S>, S extends AuthPluginSchema> =
	InferFieldsFromPlugins<Options, "user"> &
		InferFieldsFromOptions<Options, "user">;

export type AdditionalSessionFieldsInput<Options extends BetterAuthOptions<S>, S extends AuthPluginSchema> =
	InferFieldsFromPlugins<Options, "session", "input"> &
		InferFieldsFromOptions<Options, "session", "input">;

export type AdditionalSessionFieldsOutput<Options extends BetterAuthOptions<S>, S extends AuthPluginSchema> =
	InferFieldsFromPlugins<Options, "session"> &
		InferFieldsFromOptions<Options, "session">;

export type InferUser<O extends BetterAuthOptions<S> | Auth<S>, S extends AuthPluginSchema> = UnionToIntersection<
	StripEmptyObjects<
		User &
			(O extends BetterAuthOptions<S>
				? AdditionalUserFieldsOutput<O, S>
				: O extends Auth<S>
					? AdditionalUserFieldsOutput<O["options"], S>
					: {})
	>
>;

export type InferSession<O extends BetterAuthOptions<S> | Auth<S>, S extends AuthPluginSchema> =
	UnionToIntersection<
		StripEmptyObjects<
			Session &
				(O extends BetterAuthOptions<S>
					? AdditionalSessionFieldsOutput<O, S>
					: O extends Auth<S>
						? AdditionalSessionFieldsOutput<O["options"], S>
						: {})
		>
	>;

export type InferPluginTypes<O extends BetterAuthOptions<S>, S extends AuthPluginSchema> =
	O["plugins"] extends Array<infer P>
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
