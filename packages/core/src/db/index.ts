import type { BetterAuthPluginDBSchema } from "./plugin";
import type {
	BetterAuthDBSchema,
	DBFieldAttribute,
	DBFieldAttributeConfig,
	DBFieldType,
	DBPrimitive,
} from "./type";

export type { BetterAuthPluginDBSchema } from "./plugin";
export { type Account, accountSchema } from "./schema/account";
export { type RateLimit, rateLimitSchema } from "./schema/rate-limit";
export { type Session, sessionSchema } from "./schema/session";
export { coreSchema } from "./schema/shared";
export { type User, userSchema } from "./schema/user";
export { type Verification, verificationSchema } from "./schema/verification";
export type {
	BaseModelNames,
	BetterAuthDBSchema,
	DBFieldAttribute,
	DBFieldAttributeConfig,
	DBFieldType,
	DBPrimitive,
	ModelNames,
	SecondaryStorage,
} from "./type";

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

export { getAuthTables } from "./get-tables";
