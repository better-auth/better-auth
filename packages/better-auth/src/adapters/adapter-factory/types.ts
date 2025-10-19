import type {
	DBFieldAttribute,
	BetterAuthDBSchema,
} from "@better-auth/core/db";
import type {
	DBAdapterFactoryConfig,
	CustomAdapter as CoreCustomAdapter,
} from "@better-auth/core/db/adapter";
import type {
	AdapterSchemaCreation,
	TransactionAdapter,
	Where,
	Join,
} from "../../types";
import type { BetterAuthOptions } from "@better-auth/core";
import type { Prettify } from "../../types/helper";

export type AdapterFactoryOptions = {
	config: AdapterFactoryConfig;
	adapter: AdapterFactoryCustomizeAdapterCreator;
};

/**
 * @deprecated Use `DBAdapterFactoryConfig` from `@better-auth/core/db/adapter` instead.
 */
export interface AdapterFactoryConfig
	extends Omit<DBAdapterFactoryConfig<BetterAuthOptions>, "transaction"> {
	/**
	 * Execute multiple operations in a transaction.
	 *
	 * If the database doesn't support transactions, set this to `false` and operations will be executed sequentially.
	 *
	 * @default false
	 */
	transaction?:
		| false
		| (<R>(callback: (trx: TransactionAdapter) => Promise<R>) => Promise<R>);
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
	customIdGenerator?: (props: { model: string }) => string;
	/**
	 * Whether or not the adapter supports JOINs where one query can include multiple
	 * queries to grab more than 1 table's worth of data.
	 *
	 * If `false` (doesn't support JOINs) multiple adapter calls will be automatically made as a solution.
	 *
	 * @default false
	 */
	supportsJoins?: boolean;
}

export type AdapterFactoryCustomizeAdapterCreator = (config: {
	options: BetterAuthOptions;
	/**
	 * The schema of the user's Better-Auth instance.
	 */
	schema: BetterAuthDBSchema;
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
	}: {
		model: string;
		field: string;
	}) => string;
	/**
	 * Get the field attributes for a given model and field.
	 *
	 * Note: any model name or field name is allowed, whether default to schema or not.
	 */
	getFieldAttributes: ({
		model,
		field,
	}: {
		model: string;
		field: string;
	}) => DBFieldAttribute;
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
		join,
	}: {
		model: string;
		where: CleanedWhere[];
		select?: string[];
		join?: Join;
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
		where: W;
		model: string;
	}) => W extends undefined ? undefined : CleanedWhere[];
	// The following functions are exposed primarily for the purpose of having wrapper adapters.
	transformInput: (
		data: Record<string, any>,
		defaultModelName: string,
		action: "create" | "update",
		forceAllowId?: boolean,
	) => Promise<Record<string, any>>;
	transformOutput: (
		data: Record<string, any>,
		defaultModelName: string,
		select?: string[],
	) => Promise<Record<string, any>>;
	transformWhereClause: <W extends Where[] | undefined>({
		model,
		where,
	}: {
		where: W;
		model: string;
	}) => W extends undefined ? undefined : CleanedWhere[];
}) => CustomAdapter;

/**
 * @deprecated Use `CustomAdapter` from `@better-auth/core/db/adapter` instead.
 */
export interface CustomAdapter extends Omit<CoreCustomAdapter, "createSchema"> {
	createSchema?: (props: {
		/**
		 * The file the user may have passed in to the `generate` command as the expected schema file output path.
		 */
		file?: string;
		/**
		 * The tables from the user's Better-Auth instance schema.
		 */
		tables: BetterAuthDBSchema;
	}) => Promise<AdapterSchemaCreation>;
}

/**
 * @deprecated Use `CleanedWhere` from `@better-auth/core/db/adapter` instead.
 */
export type CleanedWhere = Prettify<Required<Where>>;

export type AdapterTestDebugLogs = {
	resetDebugLogs: () => void;
	printDebugLogs: () => void;
};

/**
 * @deprecated Use `AdapterFactoryOptions` instead. This export will be removed in a future version.
 */
export type CreateAdapterOptions = AdapterFactoryOptions;

/**
 * @deprecated Use `AdapterFactoryConfig` instead. This export will be removed in a future version.
 */
export type AdapterConfig = AdapterFactoryConfig;

/**
 * @deprecated Use `AdapterFactoryCustomizeAdapterCreator` instead. This export will be removed in a future version.
 */
export type CreateCustomAdapter = AdapterFactoryCustomizeAdapterCreator;
