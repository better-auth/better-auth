import type { BetterAuthDBSchema, DBFieldAttribute } from "../type";
import type { BetterAuthOptions } from "../../types";

export type DBAdapterDebugLogOption =
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

export type DBAdapterSchemaCreation = {
	/**
	 * Code to be inserted into the file
	 */
	code: string;
	/**
	 * Path to the file, including the file name and extension.
	 * Relative paths are supported, with the current working directory of the developer's project as the base.
	 */
	path: string;
	/**
	 * Append the file if it already exists.
	 * Note: This will not apply if `overwrite` is set to true.
	 */
	append?: boolean;
	/**
	 * Overwrite the file if it already exists
	 */
	overwrite?: boolean;
};

export interface DBAdapterFactoryConfig<
	Options extends BetterAuthOptions = BetterAuthOptions,
> {
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
	debugLogs?: DBAdapterDebugLogOption;
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
	 * Execute multiple operations in a transaction.
	 *
	 * If the database doesn't support transactions, set this to `false` and operations will be executed sequentially.
	 *
	 * @default false
	 */
	transaction?:
		| false
		| (<R>(
				callback: (trx: DBTransactionAdapter<Options>) => Promise<R>,
		  ) => Promise<R>);
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
	 *  id: "_id" // We want to replace `id` to `_id` to save into MongoDB
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
	 *  _id: "id" // In MongoDB, we save `id` as `_id`. So we want to replace `_id` with `id` when we get the data back.
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
		fieldAttributes: DBFieldAttribute;
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
		schema: BetterAuthDBSchema;
		/**
		 * The options of the user's Better-Auth instance.
		 */
		options: Options;
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
		fieldAttributes: DBFieldAttribute;
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
		schema: BetterAuthDBSchema;
		/**
		 * The options of the user's Better-Auth instance.
		 */
		options: Options;
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
	 *  return "my-super-unique-id";
	 * }
	 * ```
	 */
	customIdGenerator?: (props: { model: string }) => string;
	/**
	 * Whether to disable the transform output.
	 * Do not use this option unless you know what you are doing.
	 * @default false
	 */
	disableTransformOutput?: boolean;
	/**
	 * Whether to disable the transform input.
	 * Do not use this option unless you know what you are doing.
	 * @default false
	 */
	disableTransformInput?: boolean;
}

export type Where = {
	/**
	 * @default eq
	 */
	operator?:
		| "eq"
		| "ne"
		| "lt"
		| "lte"
		| "gt"
		| "gte"
		| "in"
		| "not_in"
		| "contains"
		| "starts_with"
		| "ends_with";
	value: string | number | boolean | string[] | number[] | Date | null;
	field: string;
	/**
	 * @default AND
	 */
	connector?: "AND" | "OR";
};

export type DBTransactionAdapter<
	Options extends BetterAuthOptions = BetterAuthOptions,
> = Omit<DBAdapter<Options>, "transaction">;

export type DBAdapter<Options extends BetterAuthOptions = BetterAuthOptions> = {
	id: string;
	create: <T extends Record<string, any>, R = T>(data: {
		model: string;
		data: Omit<T, "id">;
		select?: string[];
		/**
		 * By default, any `id` provided in `data` will be ignored.
		 *
		 * If you want to force the `id` to be the same as the `data.id`, set this to `true`.
		 */
		forceAllowId?: boolean;
	}) => Promise<R>;
	findOne: <T>(data: {
		model: string;
		where: Where[];
		select?: string[];
	}) => Promise<T | null>;
	findMany: <T>(data: {
		model: string;
		where?: Where[];
		limit?: number;
		sortBy?: {
			field: string;
			direction: "asc" | "desc";
		};
		offset?: number;
	}) => Promise<T[]>;
	count: (data: { model: string; where?: Where[] }) => Promise<number>;
	/**
	 * ⚠︎ Update may not return the updated data
	 * if multiple where clauses are provided
	 */
	update: <T>(data: {
		model: string;
		where: Where[];
		update: Record<string, any>;
	}) => Promise<T | null>;
	updateMany: (data: {
		model: string;
		where: Where[];
		update: Record<string, any>;
	}) => Promise<number>;
	delete: <T>(data: { model: string; where: Where[] }) => Promise<void>;
	deleteMany: (data: { model: string; where: Where[] }) => Promise<number>;
	/**
	 * Execute multiple operations in a transaction.
	 * If the adapter doesn't support transactions, operations will be executed sequentially.
	 */
	transaction: <R>(
		callback: (trx: DBTransactionAdapter<Options>) => Promise<R>,
	) => Promise<R>;
	/**
	 *
	 * @param options
	 * @param file - file path if provided by the user
	 */
	createSchema?: (
		options: Options,
		file?: string,
	) => Promise<DBAdapterSchemaCreation>;
	options?: {
		adapterConfig: DBAdapterFactoryConfig<Options>;
	} & CustomAdapter["options"];
};

export type CleanedWhere = Required<Where>;

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
		tables: BetterAuthDBSchema;
	}) => Promise<DBAdapterSchemaCreation>;
	/**
	 * Your adapter's options.
	 */
	options?: Record<string, any> | undefined;
}

export interface DBAdapterInstance<
	Options extends BetterAuthOptions = BetterAuthOptions,
> {
	(options: BetterAuthOptions): DBAdapter<Options>;
}
