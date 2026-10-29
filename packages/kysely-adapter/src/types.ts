import type { DatabaseIndexIntrospector } from "@better-auth/core/db/adapter";
import type { Dialect } from "kysely";

export type {
	DatabaseIndexColumnMetadata,
	DatabaseIndexIntrospector,
	DatabaseIndexMetadata,
} from "@better-auth/core/db/adapter";

export type KyselyDatabaseType = "postgres" | "mysql" | "sqlite" | "mssql";

/** Explicit dialect capabilities, accepted by Better Auth's database configuration. */
export interface KyselyAdapterProfile {
	/** A dialect owned by the database package. */
	dialect: Dialect;
	/** SQL semantics shared with the existing Kysely operations and migration planner. */
	type: KyselyDatabaseType;
	/** Whether the dialect supports interactive transactions. Defaults to false. */
	transaction?: boolean;
	/** Optional index metadata for dialects whose catalogs differ from the SQL family. */
	introspectIndexes?: DatabaseIndexIntrospector;
}
