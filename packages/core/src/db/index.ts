import type {
	DBFieldAttribute,
	DBFieldAttributeConfig,
	DBFieldType,
	DBPrimitive,
	BetterAuthDBSchema,
} from "./type";
import type { BetterAuthPluginDBSchema } from "./plugin";
export type { BetterAuthPluginDBSchema } from "./plugin";
export type { SecondaryStorage } from "./type";
export { coreSchema } from "./schema/shared";
export { userSchema, type User } from "./schema/user";
export { accountSchema, type Account } from "./schema/account";
export { sessionSchema, type Session } from "./schema/session";
export { verificationSchema, type Verification } from "./schema/verification";
export { rateLimitSchema, type RateLimit } from "./schema/rate-limit";

export type {
	DBFieldAttribute,
	DBFieldAttributeConfig,
	DBFieldType,
	DBPrimitive,
	BetterAuthDBSchema,
};

/**
 * @deprecated Backport for 1.3.x, we will remove this in 1.4.x
 */
export type AuthPluginSchema = BetterAuthPluginDBSchema;
/**
 * @deprecated Backport for 1.3.x, we will remove this in 1.4.x
 */
export type FieldAttribute = DBFieldAttribute;
/**
 * @deprecated Backport for 1.3.x, we will remove this in 1.4.x
 */
export type FieldAttributeConfig = DBFieldAttributeConfig;
/**
 * @deprecated Backport for 1.3.x, we will remove this in 1.4.x
 */
export type FieldType = DBFieldType;
/**
 * @deprecated Backport for 1.3.x, we will remove this in 1.4.x
 */
export type Primitive = DBPrimitive;
/**
 * @deprecated Backport for 1.3.x, we will remove this in 1.4.x
 */
export type BetterAuthDbSchema = BetterAuthDBSchema;
