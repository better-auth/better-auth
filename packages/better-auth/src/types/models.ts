import type { BetterAuthOptions } from "./options";
import type {
	accountSchema,
	sessionSchema,
	userSchema,
	verificationSchema,
} from "../db/schema";
import type { Auth } from "../auth";
import type { InferFieldsFromOptions, InferFieldsFromPlugins } from "../db";
import type { StripEmptyObjects, UnionToIntersection } from "./helper";
import type { BetterAuthPlugin } from "./plugins";
import type { z } from "zod";

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

// Base user type (core user fields)
export type BaseUser = {
	id: string;
	email: string;
	emailVerified: boolean;
	name: string;
	image?: string;
	createdAt: Date;
	updatedAt: Date;
};

// Helper type to infer additional fields from FieldAttribute
type InferAdditionalFields<O extends BetterAuthOptions, T extends string> = 
	O[T extends "user" ? "user" : T extends "session" ? "session" : never] extends {
		additionalFields: infer AF;
	}
		? AF extends Record<string, any>
			? {
					[K in keyof AF]: AF[K] extends { type: "string" }
						? string
						: AF[K] extends { type: "number" }
						? number
						: AF[K] extends { type: "boolean" }
						? boolean
						: AF[K] extends { type: "date" }
						? Date
						: unknown;
			  }
			: {}
		: {};

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

// Updated InferUser type that supports custom schemas
export type InferUser<O extends BetterAuthOptions | Auth> = UnionToIntersection<
	StripEmptyObjects<
		BaseUser &
			(O extends BetterAuthOptions
				? O["user"] extends {
						schema: infer S;
					}
					? S extends z.ZodObject<infer T>
						? z.infer<S> // Use the custom schema inference
						: BaseUser & InferAdditionalFields<O, "user"> // Fallback to additionalFields
					: BaseUser & InferAdditionalFields<O, "user"> // Default behavior
				: O extends Auth
					? O["options"]["user"] extends {
							schema: infer S;
						}
						? S extends z.ZodObject<infer T>
							? z.infer<S> // Use the custom schema inference
							: BaseUser & InferAdditionalFields<O["options"], "user"> // Fallback to additionalFields
						: BaseUser & InferAdditionalFields<O["options"], "user"> // Default behavior
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

export type User = z.infer<typeof userSchema>;
export type Account = z.infer<typeof accountSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Verification = z.infer<typeof verificationSchema>;
export type { RateLimit };
