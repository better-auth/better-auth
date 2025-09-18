import type { BetterAuthOptions } from "./options";
import type { AdapterFactoryConfig, CustomAdapter } from "../adapters";

/**
 * Adapter where clause
 */
export type Where = {
	/**
	 * @default "eq"
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
	 * @default "AND"
	 */
	connector?: "AND" | "OR";
};

/**
 * Join configuration for relational queries.
 *
 * Allows you to join related tables/models in a single query operation.
 * Each key represents the name of the joined table/model, and the value
 * configures how the join should be performed.
 */
export type Join = {
	[model: string]: {
		// In the future we may support nested joins:
		// with?: Join;
		/**
		 * The Join type that will be performed
		 *
		 * * **left**: returns all rows from the left table, plus matching rows from the right (if none, NULL fills in).
		 * * **right**: returns all rows from the right table, plus matching rows from the left (if none, NULL fills in).
		 * * **inner**: returns rows where there’s a match in both tables.
		 * * **full**: returns rows from both sides, filling in gaps with NULLs.
		 * * **cross**: cartesian product - every row from left * every row from right.
		 *
		 * @default "left"
		 */
		type?: "left" | "right" | "inner" | "full" | "cross";
		on: [originalModel: string, joinModel: string];
	};
};

/**
 * Adapter Interface
 */
export type Adapter = {
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
	findOne: <T, IsJoin extends boolean = false>(data: {
		model: string;
		where: Where[];
		select?: string[];
		join?: Join;
	}) => Promise<
		IsJoin extends true ? { [key in keyof T]: T[key] | null } : T | null
	>;
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
	delete: (data: { model: string; where: Where[] }) => Promise<void>;
	deleteMany: (data: { model: string; where: Where[] }) => Promise<number>;
	/**
	 * Execute multiple operations in a transaction.
	 * If the adapter doesn't support transactions, operations will be executed sequentially.
	 */
	transaction: <R>(
		callback: (tx: Omit<Adapter, "transaction">) => Promise<R>,
	) => Promise<R>;
	/**
	 *
	 * @param options
	 * @param file - file path if provided by the user
	 */
	createSchema?: (
		options: BetterAuthOptions,
		file?: string,
	) => Promise<AdapterSchemaCreation>;
	options?: {
		adapterConfig: AdapterFactoryConfig;
	} & CustomAdapter["options"];
};

export type TransactionAdapter = Omit<Adapter, "transaction">;

export type AdapterSchemaCreation = {
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

export interface AdapterInstance {
	(options: BetterAuthOptions): Adapter;
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
