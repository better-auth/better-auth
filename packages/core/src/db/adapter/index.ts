import type { BetterAuthOptions } from "../../types";
import type { BetterAuthDBSchema, DBFieldAttribute } from "../type";

export type DBAdapterDebugLogOption =
	| boolean
	| {
			/**
			 * Useful when you want to log only certain conditions.
			 */
			logCondition?: (() => boolean) | undefined;
			create?: boolean | undefined;
			update?: boolean | undefined;
			updateMany?: boolean | undefined;
			findOne?: boolean | undefined;
			findMany?: boolean | undefined;
			delete?: boolean | undefined;
			deleteMany?: boolean | undefined;
			consumeOne?: boolean | undefined;
			incrementOne?: boolean | undefined;
			incrementMany?: boolean | undefined;
			count?: boolean | undefined;
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
	append?: boolean | undefined;
	/**
	 * Overwrite the file if it already exists
	 */
	overwrite?: boolean | undefined;
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
	usePlural?: boolean | undefined;
	/**
	 * Enable debug logs.
	 *
	 * @default false
	 */
	debugLogs?: DBAdapterDebugLogOption | undefined;
	/**
	 * Name of the adapter.
	 *
	 * This is used to identify the adapter in the debug logs.
	 *
	 * @default `adapterId`
	 */
	adapterName?: string | undefined;
	/**
	 * Adapter id
	 */
	adapterId: string;
	/**
	 * If the database supports numeric ids, set this to `true`.
	 *
	 * @default true
	 */
	supportsNumericIds?: boolean | undefined;
	/**
	 * If the database supports natively generating UUIDs, set this to `true`.
	 *
	 * @default false
	 */
	supportsUUIDs?: boolean | undefined;
	/**
	 * If the database doesn't support JSON columns, set this to `false`.
	 *
	 * We will handle the translation between using `JSON` columns, and saving `string`s to the database.
	 *
	 * @default false
	 */
	supportsJSON?: boolean | undefined;
	/**
	 * If the database doesn't support dates, set this to `false`.
	 *
	 * We will handle the translation between using `Date` objects, and saving `string`s to the database.
	 *
	 * @default true
	 */
	supportsDates?: boolean | undefined;
	/**
	 * If the database doesn't support booleans, set this to `false`.
	 *
	 * We will handle the translation between using `boolean`s, and saving `0`s and `1`s to the database.
	 *
	 * @default true
	 */
	supportsBooleans?: boolean | undefined;
	/**
	 * If the database doesn't support arrays, set this to `false`.
	 *
	 * We will handle the translation between using `array`s, and saving `string`s to the database.
	 *
	 * @default false
	 */
	supportsArrays?: boolean | undefined;
	/**
	 * Execute multiple operations in a transaction.
	 *
	 * If the database doesn't support transactions, set this to `false` and operations will be executed sequentially.
	 *
	 * @default false
	 */
	transaction?:
		| (
				| false
				| (<R>(
						callback: (trx: DBTransactionAdapter<Options>) => Promise<R>,
				  ) => Promise<R>)
		  )
		| undefined;
	/**
	 * Maximum number of bound parameters one native `incrementMany`
	 * statement may use. Large batches are split so they stay at or below
	 * this limit. You do not need to chunk rows in `incrementMany`.
	 *
	 * Chunk size is
	 * `(incrementManyMaxParameters - assignmentBinds) / bindsPerRow`.
	 * Assignment binds are the `increment` deltas and `set` values. A row
	 * guarded by `(id, revision)` is 2 where binds, so the SQLite default
	 * of 999 plus one increment yields chunks of 499, not 500. An extra
	 * `set` field yields 498.
	 *
	 * @default 999
	 */
	incrementManyMaxParameters?: number | undefined;
	/**
	 * Maximum number of rows one native `incrementMany` statement may
	 * update. Combined with `incrementManyMaxParameters`; the smaller
	 * chunk size wins.
	 */
	incrementManyMaxRows?: number | undefined;
	/**
	 * Disable id generation for the `create` method.
	 *
	 * This is useful for databases that don't support custom id values and would auto-generate them for you.
	 *
	 * @default false
	 */
	disableIdGeneration?: boolean | undefined;
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
	mapKeysTransformInput?: Record<string, string> | undefined;
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
	mapKeysTransformOutput?: Record<string, string> | undefined;
	/**
	 * Custom transform input function.
	 *
	 * This function is used to transform the input data before it is saved to the database.
	 */
	customTransformInput?:
		| ((props: {
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
				action:
					| "create"
					| "update"
					| "findOne"
					| "findMany"
					| "updateMany"
					| "delete"
					| "deleteMany"
					| "consumeOne"
					| "incrementOne"
					| "incrementMany"
					| "count";
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
		  }) => any)
		| undefined;
	/**
	 * Custom transform output function.
	 *
	 * This function is used to transform the output data before it is returned to the user.
	 */
	customTransformOutput?:
		| ((props: {
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
		  }) => any)
		| undefined;
	/**
	 * Custom ID generator function.
	 *
	 * By default, we can handle ID generation for you, however if the database your adapter is for only supports a specific custom id generation,
	 * then you can use this function to generate your own IDs.
	 *
	 *
	 * Notes:
	 * - If the user enabled `useNumberId` or `generateId` set to `serial`, then this option will be ignored. Unless this adapter config has `supportsNumericIds` set to `false`.
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
	customIdGenerator?: ((props: { model: string }) => string) | undefined;
	/**
	 * Whether to disable the transform output.
	 * Do not use this option unless you know what you are doing.
	 * @default false
	 */
	disableTransformOutput?: boolean | undefined;
	/**
	 * Whether to disable the transform input.
	 * Do not use this option unless you know what you are doing.
	 * @default false
	 */
	disableTransformInput?: boolean | undefined;
	/**
	 * Whether to disable the transform join.
	 * Do not use this option unless you know what you are doing.
	 * @default false
	 */
	disableTransformJoin?: boolean | undefined;
}

export const whereOperators = [
	"eq",
	"ne",
	"lt",
	"lte",
	"gt",
	"gte",
	"in",
	"not_in",
	"contains",
	"starts_with",
	"ends_with",
] as const;

export type WhereOperator = (typeof whereOperators)[number];

export type Where = {
	/**
	 * @default eq
	 */
	operator?: WhereOperator | undefined;
	value: string | number | boolean | string[] | number[] | Date | null;
	field: string;
	/**
	 * @default AND
	 */
	connector?: ("AND" | "OR") | undefined;
	/**
	 * Case sensitivity for string comparisons.
	 * When "insensitive", string equality and pattern matching (contains, starts_with, ends_with)
	 * will be case-insensitive. Only applies to string values.
	 *
	 * @default "sensitive"
	 */
	mode?: "sensitive" | "insensitive" | undefined;
};

/**
 * JoinOption configuration for relational queries.
 *
 * Allows you to join related tables/models in a single query operation.
 * Each key represents the name of the joined table/model, and the value
 * configures how the join should be performed.
 */
export type JoinOption = {
	[model: string]: boolean | { limit?: number };
};

/**
 * Once `JoinOption` has gone through the adapter factory, it will be transformed into a `JoinConfig`.
 */
export type JoinConfig = {
	[model: string]: {
		/**
		 * The canonical Better Auth model key.
		 */
		modelKey?: string | undefined;
		/**
		 * The joining column names.
		 */
		on: {
			/**
			 * Column name from the main table
			 */
			from: string;
			/**
			 * Column name from the joined table
			 */
			to: string;
		};
		/**
		 * Limit the number of rows to return.
		 *
		 * If the relation has `unique` constraint, then this option will be ignored and limit will be set to 1.
		 *
		 * @default 100
		 */
		limit?: number;
		/**
		 * The relation type. Determines the output joined model data.
		 *
		 * `one-to-one` would have a single object in the output.
		 * `one-to-many` would have an array of objects in the output.
		 * `many-to-many` would have an array of objects in the output.
		 *
		 * @default "one-to-many"
		 */
		relation?: "one-to-one" | "one-to-many" | "many-to-many";
	};
};

export type DBTransactionAdapter<
	Options extends BetterAuthOptions = BetterAuthOptions,
> = Omit<DBAdapter<Options>, "transaction">;

export type DBAdapter<Options extends BetterAuthOptions = BetterAuthOptions> = {
	id: string;
	create: <T extends Record<string, any>, R = T>(data: {
		model: string;
		data: Omit<T, "id">;
		select?: string[] | undefined;
		/**
		 * By default, any `id` provided in `data` will be ignored.
		 *
		 * If you want to force the `id` to be the same as the `data.id`, set this to `true`.
		 */
		forceAllowId?: boolean | undefined;
	}) => Promise<R>;
	findOne: <T>(data: {
		model: string;
		where: Where[];
		select?: string[] | undefined;
		join?: JoinOption | undefined;
	}) => Promise<T | null>;
	findMany: <T>(data: {
		model: string;
		where?: Where[] | undefined;
		limit?: number | undefined;
		select?: string[] | undefined;
		sortBy?:
			| {
					field: string;
					direction: "asc" | "desc";
			  }
			| undefined;
		offset?: number | undefined;
		join?: JoinOption | undefined;
	}) => Promise<T[]>;
	count: (data: {
		model: string;
		where?: Where[] | undefined;
	}) => Promise<number>;
	/**
	 * Update a single row matching the where clause.
	 *
	 * Returns the updated row, or `null` when no row matched. Empty `where`
	 * clauses return `null`; use `updateMany` for intentional bulk updates.
	 *
	 * This is not the race-safe primitive for guarded state transitions. Use
	 * `incrementOne` when the predicate is both selector and guard, and use
	 * `consumeOne` for single-use destructive reads.
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
	delete: <_T>(data: { model: string; where: Where[] }) => Promise<void>;
	deleteMany: (data: { model: string; where: Where[] }) => Promise<number>;
	/**
	 * Atomically consume a single row matching the where clause: delete it and
	 * return the deleted row, or return `null` if no row matched.
	 * Implementations MUST NOT delete any additional rows that also match a
	 * non-unique predicate.
	 *
	 * Under concurrent invocation against the same row, exactly one caller
	 * receives the row; subsequent racers receive `null`. This is the
	 * race-safe primitive for consuming single-use credentials
	 * (verification tokens, authorization codes, one-time tokens).
	 *
	 * Always defined on the factory-wrapped adapter. Without a native method,
	 * the factory uses a snapshot-guarded delete and requires an exact affected
	 * row count. The adapter must evaluate the condition and deletion atomically.
	 */
	consumeOne: <T>(data: { model: string; where: Where[] }) => Promise<T | null>;
	/**
	 * Atomically apply signed numeric deltas to a single row matching the where
	 * clause. For each entry in `increment`, the operation applies
	 * `field = field + delta` in one atomic step; a negative delta decrements.
	 *
	 * The `where` clause is both the selector AND the guard: comparison
	 * operators are honored, so passing `{ field: "remaining", operator: "gt",
	 * value: 0 }` only mutates the row while `remaining` is still above zero.
	 * When the guard matches no row, the operation makes no change and returns
	 * `null`.
	 *
	 * The optional `set` map assigns absolute values to fields in the same
	 * atomic operation, alongside the increments.
	 *
	 * Returns the updated row, or `null` when the guard matched no row. Under
	 * concurrent invocation against the same row, this is the race-safe
	 * primitive for guarded counter updates (e.g. decrementing a remaining-uses
	 * counter only while it is still positive).
	 *
	 * Always defined on the factory-wrapped adapter. Without a native method,
	 * the factory uses bounded compare-and-swap retries. Contention exhaustion
	 * throws rather than returning null. Conditional writes must be atomic.
	 * A no-op may return the read snapshot without writing. A non-null result
	 * alone does not establish exclusive ownership of the row.
	 */
	incrementOne: <T>(data: {
		model: string;
		where: Where[];
		increment: Record<string, number>;
		set?: Record<string, unknown> | undefined;
	}) => Promise<T | null>;
	/**
	 * Atomically apply the same signed numeric deltas and optional absolute
	 * `set` assignments to many rows, each with its own `where`.
	 *
	 * This is a batch of `incrementOne`, not `updateMany` with arithmetic.
	 * A shared `WHERE id IN (…)` plus `revision = revision + 1` cannot
	 * express a per-row expected revision.
	 *
	 * Each row `where` is both selector and guard. Comparison operators
	 * stay valid. Each row mutates at most one record. A guard miss is not
	 * an error: that row is omitted, like `incrementOne` returning `null`.
	 *
	 * Every row `where` must include exactly one case-sensitive `id`
	 * equality. Extra clauses are the rest of the guard. Duplicate ids
	 * throw. Throws when `increment` and `set` are both empty. Empty `rows`
	 * returns `[]`.
	 *
	 * Result order is not input order. Callers check `length` and ids;
	 * they must not zip the result to `rows`. A shorter array means some
	 * guards missed. That is not a deadlock. Deadlock and serialization
	 * failures throw. Contention exhaustion on the sequential fallback
	 * throws, like `incrementOne`.
	 *
	 * Always defined on the factory-wrapped adapter. The factory sorts by
	 * `id` and chunks to the database bind/row limits before calling a
	 * native method. Without a native method, it loops `incrementOne` in
	 * that `id` order. When the adapter supports transactions, more than
	 * one native chunk or a multi-row sequential fallback runs in one
	 * transaction. Without transactions, sequential fallback and
	 * multi-chunk native calls are not all-or-nothing across rows.
	 *
	 * A no-op may return a snapshot without writing. Returned rows do not
	 * by themselves mean exclusive ownership of those records.
	 */
	incrementMany: <T>(data: {
		model: string;
		increment: Record<string, number>;
		set?: Record<string, unknown> | undefined;
		rows: Array<{ where: Where[] }>;
	}) => Promise<T[]>;
	/**
	 * Execute multiple operations in a transaction.
	 * If the adapter doesn't support transactions, operations will be executed sequentially.
	 *
	 * An adapter may run `callback` more than once, for example when MongoDB
	 * aborts the transaction with a transient error, so work outside the
	 * database belongs in `queueAfterTransactionHook`.
	 */
	transaction: <R>(
		callback: (trx: DBTransactionAdapter<Options>) => Promise<R>,
	) => Promise<R>;
	/**
	 *
	 * @param options
	 * @param file - file path if provided by the user
	 */
	createSchema?:
		| ((options: Options, file?: string) => Promise<DBAdapterSchemaCreation>)
		| undefined;
	options?:
		| ({
				adapterConfig: DBAdapterFactoryConfig<Options>;
		  } & CustomAdapter["options"])
		| undefined;
};

export type CleanedWhere = Required<Where>;

export type ModelTarget = {
	/**
	 * The physical model or table name used by the database adapter.
	 */
	model: string;
	/**
	 * The canonical Better Auth model key.
	 */
	modelKey?: string | undefined;
};

export interface CustomAdapter {
	create: <T extends Record<string, any>>({
		data,
		model,
		select,
	}: ModelTarget & {
		data: T;
		select?: string[] | undefined;
	}) => Promise<T>;
	update: <T>(
		data: ModelTarget & {
			where: CleanedWhere[];
			update: T;
		},
	) => Promise<T | null>;
	updateMany: (
		data: ModelTarget & {
			where: CleanedWhere[];
			update: Record<string, any>;
		},
	) => Promise<number>;
	findOne: <T>({
		model,
		where,
		select,
		join,
	}: ModelTarget & {
		where: CleanedWhere[];
		select?: string[] | undefined;
		join?: JoinConfig | undefined;
	}) => Promise<T | null>;
	findMany: <T>({
		model,
		where,
		limit,
		select,
		sortBy,
		offset,
		join,
	}: ModelTarget & {
		where?: CleanedWhere[] | undefined;
		limit: number;
		select?: string[] | undefined;
		sortBy?: { field: string; direction: "asc" | "desc" } | undefined;
		offset?: number | undefined;
		join?: JoinConfig | undefined;
	}) => Promise<T[]>;
	delete: ({
		model,
		where,
	}: ModelTarget & {
		where: CleanedWhere[];
	}) => Promise<void>;
	deleteMany: ({
		model,
		where,
	}: ModelTarget & {
		where: CleanedWhere[];
	}) => Promise<number>;
	/**
	 * Optional native atomic single-row consume.
	 *
	 * Implementing this method natively (e.g. `DELETE ... RETURNING *`,
	 * `findOneAndDelete`, `OUTPUT deleted.*`) gives one round trip and the
	 * strongest race-safety guarantee. Implementations must delete at most
	 * one matching row.
	 */
	consumeOne?: <T>(
		data: ModelTarget & {
			where: CleanedWhere[];
		},
	) => Promise<T | null>;
	/**
	 * Optional native atomic guarded counter mutation.
	 *
	 * Applies `field = field + delta` for each entry in `increment` (negative deltas
	 * decrement), with `where` acting as both selector and guard and `set`
	 * assigning absolute values in the same operation. Returns the updated row,
	 * or `null` when the guard matched no row.
	 *
	 * Implementing this natively (e.g. `UPDATE ... SET n = n + $delta WHERE ...
	 * RETURNING *`) gives one round trip and the strongest race-safety
	 * guarantee.
	 */
	incrementOne?: <T>(
		data: ModelTarget & {
			where: CleanedWhere[];
			increment: Record<string, number>;
			set?: Record<string, unknown> | undefined;
		},
	) => Promise<T | null>;
	// cspell:ignore UPDLOCK
	/**
	 * Optional native batch of `incrementOne`.
	 *
	 * Applies the same `increment`/`set` to each row's `where`. Each
	 * `where` must include a case-sensitive `id` equality; extra clauses
	 * are the rest of the guard. Guard misses omit that row. Result order
	 * is not input order. Implementations should update in primary-key
	 * order so concurrent batches deadlock-avoid the same way.
	 * PostgreSQL should lock matching rows with
	 * `SELECT ... ORDER BY id FOR UPDATE` before the guarded `UPDATE`.
	 * SQL Server should lock with `WITH (UPDLOCK, ROWLOCK)` and
	 * `ORDER BY id`. MySQL should update one locked row
	 * at a time in id order. SQLite serializes writers, so the guarded
	 * `UPDATE` is enough.
	 *
	 * This is not `updateMany` with arithmetic. Do not share one `WHERE
	 * id IN (…)` across rows that carry different expected revisions.
	 */
	incrementMany?: <T>(
		data: ModelTarget & {
			increment: Record<string, number>;
			set?: Record<string, unknown> | undefined;
			rows: Array<{ where: CleanedWhere[] }>;
		},
	) => Promise<T[]>;
	count: ({
		model,
		where,
	}: ModelTarget & {
		where?: CleanedWhere[] | undefined;
	}) => Promise<number>;
	createSchema?:
		| ((props: {
				/**
				 * The file the user may have passed in to the `generate` command as the expected schema file output path.
				 */
				file?: string;
				/**
				 * The tables from the user's Better-Auth instance schema.
				 */
				tables: BetterAuthDBSchema;
		  }) => Promise<DBAdapterSchemaCreation>)
		| undefined;
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

export * from "./factory";
export * from "./increment-many";
export * from "./types";
export * from "./utils";
