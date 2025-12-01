import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { LiteralString } from "../types";

export type BaseModelNames = "user" | "account" | "session" | "verification";

export type ModelNames<T extends string = LiteralString> =
	| BaseModelNames
	| T
	| "rate-limit";

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
	| number[]
	| (Record<string, unknown> | unknown[]);

export type DBFieldAttributeConfig = {
	/**
	 * If the field should be required on a new record.
	 * @default true
	 */
	required?: boolean | undefined;
	/**
	 * If the value should be returned on a response body.
	 * @default true
	 */
	returned?: boolean | undefined;
	/**
	 * If a value should be provided when creating a new record.
	 * @default true
	 */
	input?: boolean | undefined;
	/**
	 * Default value for the field
	 *
	 * Note: This will not create a default value on the database level. It will only
	 * be used when creating a new record.
	 */
	defaultValue?: (DBPrimitive | (() => DBPrimitive)) | undefined;
	/**
	 * Update value for the field
	 *
	 * Note: This will create an onUpdate trigger on the database level for supported adapters.
	 * It will be called when updating a record.
	 */
	onUpdate?: (() => DBPrimitive) | undefined;
	/**
	 * transform the value before storing it.
	 */
	transform?:
		| {
				input?: (value: DBPrimitive) => DBPrimitive | Promise<DBPrimitive>;
				output?: (value: DBPrimitive) => DBPrimitive | Promise<DBPrimitive>;
		  }
		| undefined;
	/**
	 * Reference to another model.
	 */
	references?:
		| {
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
		  }
		| undefined;
	unique?: boolean | undefined;
	/**
	 * If the field should be a bigint on the database instead of integer.
	 */
	bigint?: boolean | undefined;
	/**
	 * A zod schema to validate the value.
	 */
	validator?:
		| {
				input?: StandardSchemaV1;
				output?: StandardSchemaV1;
		  }
		| undefined;
	/**
	 * The name of the field on the database.
	 */
	fieldName?: string | undefined;
	/**
	 * If the field should be sortable.
	 *
	 * applicable only for `text` type.
	 * It's useful to mark fields varchar instead of text.
	 */
	sortable?: boolean | undefined;
	/**
	 * If the field should be indexed.
	 * @default false
	 */
	index?: boolean | undefined;
};

export type DBFieldAttribute<T extends DBFieldType = DBFieldType> = {
	type: T;
} & DBFieldAttributeConfig;

export type BetterAuthDBSchema = Record<
	string,
	{
		/**
		 * The name of the table in the database
		 */
		modelName: string;
		/**
		 * The fields of the table
		 */
		fields: Record<string, DBFieldAttribute>;
		/**
		 * Whether to disable migrations for this table
		 * @default false
		 */
		disableMigrations?: boolean | undefined;
		/**
		 * The order of the table
		 */
		order?: number | undefined;
	}
>;

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
		ttl?: number | undefined,
	) => Promise<void | null | unknown> | void;
	/**
	 *
	 * @param key - Key to delete
	 */
	delete: (key: string) => Promise<void | null | string> | void;
}
