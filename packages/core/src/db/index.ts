import type {
	DBFieldAttribute,
	DBFieldAttributeConfig,
	DBFieldType,
	DBPrimitive,
	BetterAuthDBSchema,
	DBPreservedModels,
	DBFieldPrimitive,
} from "./type";
import type { BetterAuthPluginDBSchema } from "./plugin";
export type { BetterAuthPluginDBSchema } from "./plugin";
export type { SecondaryStorage } from "./type";
export {
	coreSchema,
	userSchema,
	accountSchema,
	sessionSchema,
	verificationSchema,
	rateLimitSchema,
} from "./schema";
export type { Account, User, Session, Verification, RateLimit } from "./schema";

export type {
	DBFieldPrimitive,
	DBFieldAttribute,
	DBFieldAttributeConfig,
	DBFieldType,
	DBPrimitive,
	BetterAuthDBSchema,
	DBPreservedModels,
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
