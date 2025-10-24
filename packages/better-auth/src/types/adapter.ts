import type {
	DBAdapter,
	DBTransactionAdapter,
	Where,
	DBAdapterSchemaCreation,
	DBAdapterInstance,
} from "@better-auth/core/db/adapter";

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
		 *
		 * @default "left"
		 */
		type?: "left" | "right" | "inner" | "full"
		on: [originalModel: string, joinModel: string];
	};
};
export type {
	DBAdapter,
	DBTransactionAdapter,
	DBAdapterSchemaCreation,
	DBAdapterInstance,
} from "@better-auth/core/db/adapter";

export type { Where };

/**
 * Adapter Interface
 *
 * @deprecated Use `DBAdapter` from `@better-auth/core/db/adapter` instead.
 */
export type Adapter = DBAdapter;

/**
 * @deprecated Use `DBTransactionAdapter` from `@better-auth/core/db/adapter` instead.
 */
export type TransactionAdapter = DBTransactionAdapter;

/**
 * @deprecated Use `DBAdapterSchemaCreation` from `@better-auth/core/db/adapter` instead.
 */
export type AdapterSchemaCreation = DBAdapterSchemaCreation;

/**
 * @deprecated Use `DBAdapterInstance` from `@better-auth/core/db/adapter` instead.
 */
export type AdapterInstance = DBAdapterInstance;
