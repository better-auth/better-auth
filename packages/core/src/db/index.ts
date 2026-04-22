export { getAuthTables } from "./get-tables.js";
export type { BetterAuthPluginDBSchema } from "./plugin.js";
export {
	type Account,
	accountSchema,
	type BaseAccount,
} from "./schema/account.js";
export {
	type BaseRateLimit,
	type RateLimit,
	rateLimitSchema,
} from "./schema/rate-limit.js";
export {
	type BaseSession,
	type Session,
	sessionSchema,
} from "./schema/session.js";
export { coreSchema } from "./schema/shared.js";
export { type BaseUser, type User, userSchema } from "./schema/user.js";
export {
	type BaseVerification,
	type Verification,
	verificationSchema,
} from "./schema/verification.js";
export type {
	BaseModelNames,
	BetterAuthDBSchema,
	DBFieldAttribute,
	DBFieldAttributeConfig,
	DBFieldType,
	DBPrimitive,
	InferDBFieldInput,
	InferDBFieldOutput,
	InferDBFieldsFromOptions,
	InferDBFieldsFromOptionsInput,
	InferDBFieldsFromPlugins,
	InferDBFieldsFromPluginsInput,
	InferDBFieldsInput,
	InferDBFieldsOutput,
	InferDBValueType,
	ModelNames,
	SecondaryStorage,
} from "./type.js";
