import type { AuthPluginSchema, AuthPluginTableSchema, Ensure, SchemaTypes } from ".";
import type { BetterAuthOptions } from "./options";
import type { FieldPrimitive } from "../db/field";
import type { AdapterFactoryConfig, CustomAdapter } from "../adapters";
import type { schema } from "../db";

/**
 * Adapter where clause
 * 
 * Todo:
 *  - Make F inferred from the value of field
 *  - Fix the operand type issue (probably fixed by making F inferred) 
 */
export type Where<
	S extends AuthPluginTableSchema,
	F extends keyof S["fields"],
	// O extends
	// 	| "eq"
	// 	| "ne"
	// 	| "lt"
	// 	| "lte"
	// 	| "gt"
	// 	| "gte"
	// 	| "contains"
	// 	| "starts_with"
	// 	| "ends_with"
	// 	| "in"
	// 	| "not_in" = "eq"
	// > = O extends "in" | "not_in" ? InWhere<S, F> : GenericWhere<S, F>;
	> = GenericWhere<S, F> | InWhere<S, F>;
	
type GenericWhere<
	S extends AuthPluginTableSchema,
	F extends keyof S["fields"]
> = {
	operator?: S["fields"][F]["type"] extends "number" | "date"
		?
				| "lt"
				| "lte"
				| "gt"
				| "gte"
				| "eq"
				| "ne"
				| "starts_with"
				| "ends_with"
		: S["fields"][F]["type"] extends `${string}[]`
		? "contains" | "eq" | "ne" | "starts_with" | "ends_with"
		:
				| "eq"
				| "ne"
				| "starts_with"
				| "ends_with"; //eq by default
	value: FieldPrimitive<S["fields"][F]["type"]>;
	field: F;
	connector?: "AND" | "OR"; //AND by default
};

type InWhere<S extends AuthPluginTableSchema, F extends keyof S["fields"]> = {
	operator: "in" | "not_in";
	value: FieldPrimitive<S["fields"][F]["type"]>[];
	field: F;
	connector?: "AND" | "OR"; //AND by default
};

/**
 * Adapter Interface
 */
export type Adapter<
	S extends AuthPluginSchema = typeof schema
> = {
	id: string;
	create: <M extends keyof S>(data: {
		model: M;
		data: Omit<SchemaTypes<S[M], true>, "id">;
		select?: string[];
		/**
		 * By default, any `id` provided in `data` will be ignored.
		 *
		 * If you want to force the `id` to be the same as the `data.id`, set this to `true`.
		 */
		forceAllowId?: boolean;
	}) => Promise<SchemaTypes<S[M]>>;
	findOne: <M extends keyof S & string>(data: {
		model: M;
		where: Where<Ensure<S[M], AuthPluginTableSchema>, keyof S[M]["fields"] & string>[];
		select?: string[];
	}) => Promise<SchemaTypes<S[M]> | null>;
	findMany: <M extends keyof S & string, W extends Where<Ensure<S[M], AuthPluginTableSchema>, keyof S[M]["fields"] & string>>(data: {
		model: M;
		where?: W[];
		limit?: number;
		sortBy?: {
			field: string;
			direction: "asc" | "desc";
		};
		offset?: number;
	}) => Promise<SchemaTypes<S[M]>[]>;
	count: <M extends keyof S & string>(data: { model: M; where?: Where<Ensure<S[M], AuthPluginTableSchema>, keyof S[M]["fields"] & string>[] }) => Promise<number>;
	/**
	 * ⚠︎ Update may not return the updated data
	 * if multiple where clauses are provided
	 */
	update: <M extends keyof S & string>(data: {
		model: M;
		where: Where<Ensure<S[M], AuthPluginTableSchema>, keyof S[M]["fields"] & string>[];
		update: Partial<SchemaTypes<S[M]>>;
	}) => Promise<SchemaTypes<S[M]> | null>;
	updateMany: <M extends keyof S & string>(data: {
		model: M;
		where: Where<Ensure<S[M], AuthPluginTableSchema>, keyof S[M]["fields"] & string>[];
		update: Partial<SchemaTypes<S[M]>>;
	}) => Promise<number>;
	delete: <M extends keyof S & string>(data: { model: M; where: Where<Ensure<S[M], AuthPluginTableSchema>, keyof S[M]["fields"] & string>[] }) => Promise<void>;
	deleteMany: <M extends keyof S & string>(data: { model: M; where: Where<Ensure<S[M], AuthPluginTableSchema>, keyof S[M]["fields"] & string>[] }) => Promise<number>;
	/**
	 * Execute multiple operations in a transaction.
	 * If the adapter doesn't support transactions, operations will be executed sequentially.
	 */
	transaction: <R>(
		callback: (tx: TransactionAdapter<S>) => Promise<R>,
	) => Promise<R>;
	/**
	 *
	 * @param options
	 * @param file - file path if provided by the user
	 */
	createSchema?: (
		options: BetterAuthOptions<S>,
		file?: string,
	) => Promise<AdapterSchemaCreation>;
	options?: {
		adapterConfig: AdapterFactoryConfig<S>;
	} & CustomAdapter<S>["options"];
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

export type TransactionAdapter<S extends AuthPluginSchema> = Omit<Adapter<S>, "transaction">;

export interface AdapterInstance<S extends AuthPluginSchema> {
	(options: BetterAuthOptions<S>): Adapter<S>;
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
