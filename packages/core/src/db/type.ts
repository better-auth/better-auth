import type { ZodType } from "zod";
import type { LiteralString } from "../types";

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

export type DBFieldAttributeConfig = {
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
	defaultValue?: DBPrimitive | (() => DBPrimitive);
	/**
	 * Update value for the field
	 *
	 * Note: This will create an onUpdate trigger on the database level for supported adapters.
	 * It will be called when updating a record.
	 */
	onUpdate?: () => DBPrimitive;
	/**
	 * transform the value before storing it.
	 */
	transform?: {
		input?: (value: DBPrimitive) => DBPrimitive | Promise<DBPrimitive>;
		output?: (value: DBPrimitive) => DBPrimitive | Promise<DBPrimitive>;
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
		disableMigrations?: boolean;
		/**
		 * The order of the table
		 */
		order?: number;
	}
>;
