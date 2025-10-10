import type { BetterAuthPluginDBTableSchema } from "./plugin";
import type {
	DBFieldAttribute,
	DBFieldAttributeConfig,
	DBFieldType,
	DBRequiredTable,
	InferDBType,
} from "./type";

export const field = <
	T extends DBFieldType,
	C extends DBFieldAttributeConfig<T>,
>(
	type: T,
	config?: C,
) => {
	return {
		type,
		...config,
	} satisfies DBFieldAttribute<T>;
};

export const coreSchema = {
	id: field("string"),
	createdAt: field("date", { defaultValue: () => new Date() }),
	updatedAt: field("date", { defaultValue: () => new Date() }),
};

export type CoreSchemaFields = "id" | "createdAt" | "updatedAt";

export const accountSchema = {
	fields: {
		providerId: field("string"),
		accountId: field("string"),
		userId: field("string"),
		accessToken: field("string", { required: false }),
		refreshToken: field("string", { required: false }),
		idToken: field("string", { required: false }),
		/**
		 * Access token expires at
		 */
		accessTokenExpiresAt: field("date", { required: false }),
		/**
		 * Refresh token expires at
		 */
		refreshTokenExpiresAt: field("date", { required: false }),
		/**
		 * The scopes that the user has authorized
		 */
		scope: field("string", { required: false }),
		/**
		 * Password is only stored in the credential provider
		 */
		password: field("string", { required: false }),

		...coreSchema,
	},

	modelName: "account",
};

export const rateLimitSchema = {
	fields: {
		key: field("string"),
		count: field("number"),
		lastRequest: field("number", { bigint: true }),

		...coreSchema,
	},
	modelName: "ratelimit",
};

export const sessionSchema = {
	fields: {
		userId: field("string"),
		expiresAt: field("date"),
		token: field("string"),
		ipAddress: field("string", { required: false }),
		userAgent: field("string", { required: false }),

		...coreSchema,
	},
	modelName: "session",
};

export const userSchema = {
	fields: {
		email: field("string", {
			transform: { input: (val) => val.toLowerCase() },
		}),
		emailVerified: field("boolean", { defaultValue: false }),
		name: field("string"),
		image: field("string", { required: false }),

		...coreSchema,
	},
	modelName: "user",
};

export const verificationSchema = {
	fields: {
		value: field("string"),
		expiresAt: field("date"),
		identifier: field("string"),

		...coreSchema,
	},
	modelName: "verification",
};

export const schema = {
	account: accountSchema,
	user: userSchema,
	session: sessionSchema,
	verification: verificationSchema,
	ratelimit: rateLimitSchema,
};

export type Account<S extends DBRequiredTable<"account"> = typeof schema> =
	InferDBType<S["account"]> & {
		[core in CoreSchemaFields]: BetterAuthPluginDBTableSchema;
	};

export type RateLimit<S extends DBRequiredTable<"ratelimit"> = typeof schema> =
	InferDBType<S["ratelimit"]> & {
		[core in CoreSchemaFields]: BetterAuthPluginDBTableSchema;
	};
export type Session<S extends DBRequiredTable<"session"> = typeof schema> =
	InferDBType<S["session"]> & {
		[core in CoreSchemaFields]: BetterAuthPluginDBTableSchema;
	};

export type User<S extends DBRequiredTable<"user"> = typeof schema> =
	InferDBType<S["user"]> & {
		[core in CoreSchemaFields]: BetterAuthPluginDBTableSchema;
	};

export type Verification<
	S extends DBRequiredTable<"verification"> = typeof schema,
> = InferDBType<S["verification"]> & {
	[core in CoreSchemaFields]: BetterAuthPluginDBTableSchema;
};
