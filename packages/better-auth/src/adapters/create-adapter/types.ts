import type { FieldAttribute } from "../../db";
import type { BetterAuthDbSchema } from "../../db/get-tables";
import type {
	AdapterSchemaCreation,
	BetterAuthOptions,
	Where,
} from "../../types";
import type { Prettify } from "../../types/helper";

export type AdapterDebugLogs =
	| boolean
	| {
			/**
			 * Useful when you want to log only certain conditions.
			 */
			logCondition?: (() => boolean) | undefined;
			create?: boolean;
			update?: boolean;
			updateMany?: boolean;
			findOne?: boolean;
			findMany?: boolean;
			delete?: boolean;
			deleteMany?: boolean;
			count?: boolean;
	  }
	| {
			/**
			 * Only used for adapter tests to show debug logs if a test fails.
			 *
			 * @deprecated Not actually deprecated. Doing this for IDEs to show this option at the very bottom and stop end-users from using this.
			 */
			isRunningAdapterTests: boolean;
	  };

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
	debugLogs?: AdapterDebugLogs;
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
	 * @default false
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
		 * The action which was called from the adapter.
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
	/**
	 * Custom ID generator function.
	 *
	 * By default, we can handle ID generation for you, however if the database your adapter is for only supports a specific custom id generation,
	 * then you can use this function to generate your own IDs.
	 *
	 *
	 * Notes:
	 * - If the user enabled `useNumberId`, then this option will be ignored. Unless this adapter config has `supportsNumericIds` set to `false`.
	 * - If `generateId` is `false` in the user's Better-Auth config, then this option will be ignored.
	 * - If `generateId` is a function, then it will override this option.
	 *
	 * @example
	 *
	 * ```ts
	 * customIdGenerator: ({ model }) => {
	 * 	return "my-super-unique-id";
	 * }
	 * ```
	 */
	customIdGenerator?: (props: {
		model: string;
	}) => string;
}

export type CreateCustomAdapter = ({
	options,
	debugLog,
	schema,
	getDefaultModelName,
	getDefaultFieldName,
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
	 * Get the model name which is expected to be saved in the database based on the user's schema.
	 */
	getModelName: (model: string) => string;
	/**
	 * Get the field name which is expected to be saved in the database based on the user's schema.
	 */
	getFieldName: ({ model, field }: { model: string; field: string }) => string;
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
	/**
	 * This function helps us get the default field name from the schema defined by devs.
	 * Often times, the user will be using the `fieldName` which could had been customized by the users.
	 * This function helps us get the actual field name useful to match against the schema. (eg: schema[model].fields[field])
	 *
	 * If it's still unclear what this does:
	 *
	 * 1. User can define a custom fieldName.
	 * 2. When using a custom fieldName, doing something like `schema[model].fields[field]` will not work.
	 *
	 */
	getDefaultFieldName: ({
		model,
		field,
	}: { model: string; field: string }) => string;
	/**
	 * Get the field attributes for a given model and field.
	 *
	 * Note: any model name or field name is allowed, whether default to schema or not.
	 */
	getFieldAttributes: ({
		model,
		field,
	}: { model: string; field: string }) => FieldAttribute;
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
		where: CleanedWhere[];
		update: T;
	}) => Promise<T | null>;
	updateMany: (data: {
		model: string;
		where: CleanedWhere[];
		update: Record<string, any>;
	}) => Promise<number>;
	findOne: <T>({
		model,
		where,
		select,
	}: {
		model: string;
		where: CleanedWhere[];
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
		where?: CleanedWhere[];
		limit: number;
		sortBy?: { field: string; direction: "asc" | "desc" };
		offset?: number;
	}) => Promise<T[]>;
	delete: ({
		model,
		where,
	}: {
		model: string;
		where: CleanedWhere[];
	}) => Promise<void>;
	deleteMany: ({
		model,
		where,
	}: {
		model: string;
		where: CleanedWhere[];
	}) => Promise<number>;
	count: ({
		model,
		where,
	}: {
		model: string;
		where?: CleanedWhere[];
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

export type CleanedWhere = Prettify<Required<Where>>;

export type AdapterTestDebugLogs = {
	resetDebugLogs: () => void;
	printDebugLogs: () => void;
};
