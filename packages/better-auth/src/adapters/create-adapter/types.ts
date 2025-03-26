import type { FieldAttribute } from "../../db";
import type { BetterAuthDbSchema } from "../../db/get-tables";
import type {
	AdapterSchemaCreation,
	BetterAuthOptions,
	Where,
} from "../../types";

export interface AdapterConfig {
	/**
	 * Use plural table names.
	 *
	 * All tables will be named with an `s` at the end.
	 *
	 * @default false
	 */
	usePlural?: boolean;
	/**
	 * Enable debug logs.
	 *
	 * @default false
	 */
	debugLogs?:
		| boolean
		| {
				create?: boolean;
				update?: boolean;
				updateMany?: boolean;
				findOne?: boolean;
				findMany?: boolean;
				delete?: boolean;
				deleteMany?: boolean;
				count?: boolean;
		  };
	/**
	 * Name of the adapter.
	 *
	 * This is used to identify the adapter in the debug logs.
	 *
	 * @default `adapterId`
	 */
	adapterName?: string;
	/**
	 * Adapter id
	 */
	adapterId: string;
	/**
	 * If the database supports numeric ids, set this to `true`.
	 *
	 * @default true
	 */
	supportsNumericIds?: boolean;
	/**
	 * If the database doesn't support JSON columns, set this to `false`.
	 *
	 * We will handle the translation between using `JSON` columns, and saving `string`s to the database.
	 *
	 * @default true
	 */
	supportsJSON?: boolean;
	/**
	 * If the database doesn't support dates, set this to `false`.
	 *
	 * We will handle the translation between using `Date` objects, and saving `string`s to the database.
	 *
	 * @default true
	 */
	supportsDates?: boolean;
	/**
	 * If the database doesn't support booleans, set this to `false`.
	 *
	 * We will handle the translation between using `boolean`s, and saving `0`s and `1`s to the database.
	 *
	 * @default true
	 */
	supportsBooleans?: boolean;
	/**
	 * Disable id generation for the `create` method.
	 *
	 * This is useful for databases that don't support custom id values and would auto-generate them for you.
	 *
	 * @default false
	 */
	disableIdGeneration?: boolean;
	/**
	 * Map the keys of the input data.
	 *
	 * This is useful for databases that expect a different key name for a given situation.
	 *
	 * For example, MongoDB uses `_id` while in Better-Auth we use `id`.
	 *
	 *
	 * @example
	 * Each key represents the old key to replace.
	 * The value represents the new key
	 *
	 * This can be a partial object that only transforms some keys.
	 *
	 * ```ts
	 * mapKeysTransformInput: {
	 *	id: "_id" // We want to replace `id` to `_id` to save into MongoDB
	 * }
	 * ```
	 */
	mapKeysTransformInput?: Record<string, string>;
	/**
	 * Map the keys of the output data.
	 *
	 * This is useful for databases that expect a different key name for a given situation.
	 *
	 * For example, MongoDB uses `_id` while in Better-Auth we use `id`.
	 *
	 * @example
	 * Each key represents the old key to replace.
	 * The value represents the new key
	 *
	 * This can be a partial object that only transforms some keys.
	 *
	 * ```ts
	 * mapKeysTransformOutput: {
	 * 	_id: "id" // In MongoDB, we save `id` as `_id`. So we want to replace `_id` with `id` when we get the data back.
	 * }
	 * ```
	 */
	mapKeysTransformOutput?: Record<string, string>;
	/**
	 * Custom transform input function.
	 *
	 * This function is used to transform the input data before it is saved to the database.
	 */
	customTransformInput?: (props: {
		data: any;
		/**
		 * The fields of the model.
		 */
		fieldAttributes: FieldAttribute;
		/**
		 * The field to transform.
		 */
		field: string;
		/**
		 * The action to perform.
		 */
		action: "create" | "update";
		/**
		 * The model name.
		 */
		model: string;
		/**
		 * The schema of the user's Better-Auth instance.
		 */
		schema: BetterAuthDbSchema;
		/**
		 * The options of the user's Better-Auth instance.
		 */
		options: BetterAuthOptions;
	}) => any;
	/**
	 * Custom transform output function.
	 *
	 * This function is used to transform the output data before it is returned to the user.
	 */
	customTransformOutput?: (props: {
		data: any;
		/**
		 * The fields of the model.
		 */
		fieldAttributes: FieldAttribute;
		/**
		 * The field to transform.
		 */
		field: string;
		/**
		 * The fields to select.
		 */
		select: string[];
		/**
		 * The model name.
		 */
		model: string;
		/**
		 * The schema of the user's Better-Auth instance.
		 */
		schema: BetterAuthDbSchema;
		/**
		 * The options of the user's Better-Auth instance.
		 */
		options: BetterAuthOptions;
	}) => any;
}

export type CreateCustomAdapter = ({
	options,
	debugLog,
	schema,
	getDefaultModelName,
}: {
	options: BetterAuthOptions;
	/**
	 * The schema of the user's Better-Auth instance.
	 */
	schema: BetterAuthDbSchema;
	/**
	 * The debug log function.
	 *
	 * If the config has defined `debugLogs` as `false`, no logs will be shown.
	 */
	debugLog: (...args: any[]) => void;
	/**
	 * Get the actual field name from the schema.
	 */
	getField: ({ model, field }: { model: string; field: string }) => string;
	/**
	 * This function helps us get the default model name from the schema defined by devs.
	 * Often times, the user will be using the `modelName` which could had been customized by the users.
	 * This function helps us get the actual model name useful to match against the schema. (eg: schema[model])
	 *
	 * If it's still unclear what this does:
	 *
	 * 1. User can define a custom modelName.
	 * 2. When using a custom modelName, doing something like `schema[model]` will not work.
	 * 3. Using this function helps us get the actual model name based on the user's defined custom modelName.
	 * 4. Thus allowing us to use `schema[model]`.
	 */
	getDefaultModelName: (model: string) => string;
}) => CustomAdapter;

export interface CustomAdapter {
	create: <T extends Record<string, any>>({
		data,
		model,
		select,
	}: {
		model: string;
		data: T;
		select?: string[];
	}) => Promise<T>;
	update: <T>(data: {
		model: string;
		where: Where[];
		update: T;
	}) => Promise<T | null>;
	updateMany: (data: {
		model: string;
		where: Where[];
		update: Record<string, any>;
	}) => Promise<number>;
	findOne: <T>({
		model,
		where,
		select,
	}: {
		model: string;
		where: Where[];
		select?: string[];
	}) => Promise<T | null>;
	findMany: <T>({
		model,
		where,
		limit,
		sortBy,
		offset,
	}: {
		model: string;
		where?: Where[];
		limit: number;
		sortBy?: { field: string; direction: "asc" | "desc" };
		offset?: number;
	}) => Promise<T[]>;
	delete: ({
		model,
		where,
	}: {
		model: string;
		where: Where[];
	}) => Promise<void>;
	deleteMany: ({
		model,
		where,
	}: {
		model: string;
		where: Where[];
	}) => Promise<number>;
	count: ({
		model,
		where,
	}: {
		model: string;
		where?: Where[];
	}) => Promise<number>;
	createSchema?: (props: {
		/**
		 * The file the user may have passed in to the `generate` command as the expected schema file output path.
		 */
		file?: string;
		/**
		 * The tables from the user's Better-Auth instance schema.
		 */
		tables: BetterAuthDbSchema;
	}) => Promise<AdapterSchemaCreation>;
	/**
	 * Your adapter's options.
	 */
	options?: Record<string, any> | undefined;
}
