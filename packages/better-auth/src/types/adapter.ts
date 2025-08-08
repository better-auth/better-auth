import type { BetterAuthOptions } from "./options";

/**
 * Adapter where clause
 */
export type Where = {
	operator?:
		| "eq"
		| "ne"
		| "lt"
		| "lte"
		| "gt"
		| "gte"
		| "in"
		| "contains"
		| "starts_with"
		| "ends_with"; //eq by default
	value: string | number | boolean | string[] | number[] | Date | null;
	field: string;
	connector?: "AND" | "OR"; //AND by default
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
	count: (data: {
		model: string;
		where?: Where[];
	}) => Promise<number>;
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
	 *
	 * @param options
	 * @param file - file path if provided by the user
	 */
	createSchema?: (
		options: BetterAuthOptions,
		file?: string,
	) => Promise<AdapterSchemaCreation>;
	options?: Record<string, any>;
};

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
	get: (key: string) => Promise<string | null> | string | null;
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
	) => Promise<void | null | string> | void;
	/**
	 *
	 * @param key - Key to delete
	 */
	delete: (key: string) => Promise<void | null | string> | void;
}
