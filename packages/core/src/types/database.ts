/**
 * Structural ("bring your own driver") stand-ins for the database handles the
 * built-in Kysely adapter accepts. Vendoring them keeps Kysely an optional
 * dependency: `@better-auth/core` no longer imports from `kysely`, so apps
 * using Drizzle, Prisma, or Mongo never need Kysely's types installed.
 */

/** Database engine the built-in adapter targets. */
export type DatabaseType = "postgres" | "mysql" | "sqlite" | "mssql";

/**
 * A Kysely `Dialect`. Pass it as `{ dialect, type }` so the engine is explicit.
 */
export interface SqlDialect {
	createDriver(): unknown;
	createQueryCompiler(): unknown;
	createAdapter(): unknown;
	createIntrospector(db: unknown): unknown;
}

/** A `pg`-style connection pool. */
export interface PostgresPoolLike {
	connect(): Promise<unknown>;
	end(): Promise<void>;
}

/** A `mysql2`-style connection pool. */
export interface MysqlPoolLike {
	getConnection(): unknown;
	end(callback?: (error: unknown) => void): unknown;
}

/** A `better-sqlite3`-style database handle. */
export interface SqliteDatabaseLike {
	close(): unknown;
	prepare(source: string): unknown;
}

/**
 * Opaque stand-in for a Kysely instance passed as `{ db, type }`. The `type`
 * field is the discriminator, so the instance itself stays untyped here.
 */
export type KyselyInstance = object;

/** A Kysely-style migration, used by `BetterAuthPlugin.migrations`. */
export interface DatabaseMigration {
	up(db: KyselyInstance): Promise<void>;
	down?(db: KyselyInstance): Promise<void>;
}
