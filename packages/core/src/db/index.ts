import type {
	DBFieldAttribute,
	DBFieldAttributeConfig,
	DBFieldType,
	DBPrimitive,
	BetterAuthDBSchema,
} from "./type";

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
