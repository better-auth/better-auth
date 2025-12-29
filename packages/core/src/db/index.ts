export { getAuthTables } from "./get-tables";
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
