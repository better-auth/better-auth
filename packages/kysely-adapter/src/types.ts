import type { DatabaseIndexIntrospector } from "@better-auth/core/db/adapter";
import type { Dialect } from "kysely";

export type {
	DatabaseIndexColumnMetadata,
	DatabaseIndexIntrospector,
	DatabaseIndexMetadata,
} from "@better-auth/core/db/adapter";

export type KyselyDatabaseType = "postgres" | "mysql" | "sqlite" | "mssql";

/**
 * A Kysely dialect and what the adapter needs to know about it. You can pass
 * it to Better Auth as `database`.
 */
export interface KyselyAdapterProfile {
	dialect: Dialect;
	/**
	 * The SQL family the dialect uses.
	 */
	type: KyselyDatabaseType;
	/**
	 * Whether the dialect supports interactive transactions.
	 *
	 * @default false
	 */
	transaction?: boolean;
	/**
	 * Reads index metadata, if the database's catalog doesn't match `type`.
	 */
	introspectIndexes?: DatabaseIndexIntrospector;
}
