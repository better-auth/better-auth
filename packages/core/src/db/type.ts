import type { ZodType } from "zod";
import type { BetterAuthPlugin, LiteralString } from "../types";
import type { BetterAuthPluginDBSchema } from ".";
import type { BetterAuthPluginDBTableSchema } from "./plugin";

export type DBPreservedModels =
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

export type DBFieldType =
	| "string"
	| "number"
	| "boolean"
	| "date"
	| "json"
	| `${"string" | "number"}[]`
	| Array<LiteralString>;

export type DBPrimitive =
	| string
	| number
	| boolean
	| Date
	| null
	| undefined
	| string[]
	| number[];

export type DBFieldPrimitive<T extends DBFieldType> = T extends "string"
	? string
	: T extends "number"
		? number
		: T extends "boolean"
			? boolean
			: T extends "date"
				? Date
				: T extends `${infer T}[]`
					? T extends "string"
						? string[]
						: number[]
					: T extends Array<any>
						? T[number]
						: never;

export type DBFieldAttributeConfig<T extends DBFieldType = DBFieldType> = {
		/**
		 * If the field should be required on a new record.
		 * @default true
		 */
		required?: boolean;
		/**
		 * If the value should be returned on a response body.
		 * @default true
		 */
		returned?: boolean;
		/**
		 * If a value should be provided when creating a new record.
		 * @default true
		 */
		input?: boolean;
		/**
		 * Default value for the field
		 *
		 * Note: This will not create a default value on the database level. It will only
		 * be used when creating a new record.
		 */
		defaultValue?: DBFieldPrimitive<T> | (() => DBFieldPrimitive<T>);
		/**
		 * Update value for the field
		 *
		 * Note: This will create an onUpdate trigger on the database level for supported adapters.
		 * It will be called when updating a record.
		 */
		onUpdate?: () => DBFieldPrimitive<T>;
		/**
		 * transform the value before storing it.
		 */
		transform?: {
			input?: (
				value: DBFieldPrimitive<T>,
			) => DBFieldPrimitive<T> | Promise<DBFieldPrimitive<T>>;
			output?: (
				value: DBFieldPrimitive<T>,
			) => DBFieldPrimitive<T> | Promise<DBFieldPrimitive<T>>;
		};
		/**
		 * Reference to another model.
		 */
		references?: {
			/**
			 * The model to reference.
			 */
			model: string;
			/**
			 * The field on the referenced model.
			 */
			field: string;
			/**
			 * The action to perform when the reference is deleted.
			 * @default "cascade"
			 */
			onDelete?:
				| "no action"
				| "restrict"
				| "cascade"
				| "set null"
				| "set default";
		};
		unique?: boolean;
		/**
		 * If the field should be a bigint on the database instead of integer.
		 */
		bigint?: boolean;
		/**
		 * A zod schema to validate the value.
		 */
		validator?: {
			input?: ZodType;
			output?: ZodType;
		};
		/**
		 * The name of the field on the database.
		 */
		fieldName?: string;
		/**
		 * If the field should be sortable.
		 *
		 * applicable only for `text` type.
		 * It's useful to mark fields varchar instead of text.
		 */
		sortable?: boolean;
	};

export type DBFieldAttribute<T extends DBFieldType = any> = {
	type: T;
} & DBFieldAttributeConfig<T>;

export type DBRequiredTable<K extends string> = BetterAuthPluginDBSchema & {
	[key in K]: BetterAuthPluginDBTableSchema;
};

export type InferDBType<S extends BetterAuthPluginDBTableSchema> = {
	[field in keyof S["fields"] & string]: DBFieldPrimitive<S["fields"][field]["type"]>;
}

export type BetterAuthDBSchema = BetterAuthPluginDBSchema & {
	[key in string]: {
		/**
		 * The order of the table
		 */
		order?: number;
	}
}

export interface SecondaryStorage {
	/**
	 *
	 * @param key - Key to get
	 * @returns - Value of the key
	 */
	get: (key: string) => Promise<unknown> | unknown;
	set: (
		/**
		 * Key to store
		 */
		key: string,
		/**
		 * Value to store
		 */
		value: string,
		/**
		 * Time to live in seconds
		 */
		ttl?: number,
	) => Promise<void | null | unknown> | void;
	/**
	 *
	 * @param key - Key to delete
	 */
	delete: (key: string) => Promise<void | null | string> | void;
}
