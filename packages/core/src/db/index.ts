export { getAuthTables } from "./get-tables";
export type { BetterAuthPluginDBSchema } from "./plugin";
export {
	type Account,
	accountSchema,
	type BaseAccount,
} from "./schema/account";
export {
	type BaseRateLimit,
	type RateLimit,
	rateLimitSchema,
} from "./schema/rate-limit";
export {
	type BaseSession,
	type Session,
	sessionSchema,
} from "./schema/session";
export { coreSchema } from "./schema/shared";
export { type BaseUser, type User, userSchema } from "./schema/user";
export {
	type BaseVerification,
	type Verification,
	verificationSchema,
} from "./schema/verification";
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
} from "./type";
