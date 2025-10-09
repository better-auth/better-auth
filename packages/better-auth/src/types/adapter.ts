import type { BetterAuthOptions } from "@better-auth/core";
import type {
	DBAdapter,
	DBTransactionAdapter,
	Where,
	DBAdapterSchemaCreation,
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

export interface AdapterInstance {
	(options: BetterAuthOptions): Adapter;
}
