import type { BetterAuthOptions } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import type { Dialect } from "kysely";
import {
	Kysely,
	MssqlDialect,
	MysqlDialect,
	PostgresDialect,
	SqliteDialect,
} from "kysely";
import type { DatabaseIndexIntrospector, KyselyDatabaseType } from "./types";

export function getKyselyDatabaseType(
	db: BetterAuthOptions["database"],
): KyselyDatabaseType | null {
	if (!db) {
		return null;
	}
	if ("dialect" in db) {
		return getKyselyDatabaseType(db.dialect as Dialect);
	}
	if ("createDriver" in db) {
		if (db instanceof SqliteDialect) {
			return "sqlite";
		}
		if (db instanceof MysqlDialect) {
			return "mysql";
		}
		if (db instanceof PostgresDialect) {
			return "postgres";
		}
		if (db instanceof MssqlDialect) {
			return "mssql";
		}
	}
	if ("aggregate" in db) {
		return "sqlite";
	}

	if ("getConnection" in db) {
		return "mysql";
	}
	if ("connect" in db) {
		return "postgres";
	}
	if ("fileControl" in db) {
		return "sqlite";
	}
	if ("open" in db && "close" in db && "prepare" in db) {
		return "sqlite";
	}
	// Cloudflare D1
	if ("batch" in db && "exec" in db && "prepare" in db) {
		return "sqlite";
	}
	return null;
}

/**
 * Resolves the configured database schema (namespace) for Better Auth's tables.
 *
 * Only PostgreSQL is supported: the other dialects Better Auth ships with
 * either have no schema namespaces (SQLite) or need migration inspection that
 * is not schema-aware yet (MySQL, MSSQL), so an ignored `schemaName` would
 * silently create the tables somewhere else.
 *
 * @throws {BetterAuthError} when a schema is configured for another dialect.
 */
function getKyselySchemaName(
	schemaName: string | undefined,
	databaseType: KyselyDatabaseType | null,
): string | undefined {
	if (schemaName === undefined) return undefined;
	if (typeof schemaName !== "string" || schemaName.length === 0) {
		throw new BetterAuthError(
			"`database.schemaName` must be a non-empty schema name.",
		);
	}
	if (databaseType !== "postgres") {
		throw new BetterAuthError(
			`\`database.schemaName\` is only supported on PostgreSQL, but the configured database type is "${databaseType ?? "unknown"}".`,
		);
	}
	return schemaName;
}

export const createKyselyAdapter = async (config: BetterAuthOptions) => {
	const db = config.database;

	if (!db) {
		return {
			kysely: null,
			databaseType: null,
			introspectIndexes: undefined,
			schemaName: undefined,
			transaction: undefined,
		};
	}

	if ("db" in db) {
		const schemaName = getKyselySchemaName(db.schemaName, db.type);
		return {
			kysely: schemaName ? db.db.withSchema(schemaName) : db.db,
			databaseType: db.type,
			introspectIndexes: undefined,
			schemaName,
			transaction: db.transaction,
		};
	}

	if ("dialect" in db) {
		const schemaName = getKyselySchemaName(db.schemaName, db.type);
		const kysely = new Kysely<any>({ dialect: db.dialect });
		return {
			kysely: schemaName ? kysely.withSchema(schemaName) : kysely,
			databaseType: db.type,
			introspectIndexes: undefined,
			schemaName,
			transaction: db.transaction,
		};
	}

	let dialect: Dialect | undefined = undefined;
	let introspectIndexes: DatabaseIndexIntrospector | undefined = undefined;
	let transaction: boolean | undefined = undefined;

	const databaseType = getKyselyDatabaseType(db);

	if ("createDriver" in db) {
		// Caller-supplied dialects have unverified transaction capability; leave undefined.
		dialect = db;
	}

	if ("aggregate" in db && !("createSession" in db)) {
		dialect = new SqliteDialect({
			database: db,
		});
		transaction = true;
	}

	if ("getConnection" in db) {
		// @ts-expect-error - mysql2/promise
		dialect = new MysqlDialect(db);
		transaction = true;
	}

	if ("connect" in db) {
		dialect = new PostgresDialect({
			pool: db,
		});
		transaction = true;
	}

	if ("fileControl" in db) {
		const { BunSqliteDialect } = await import("./bun-sqlite-dialect");
		dialect = new BunSqliteDialect({
			database: db,
		});
		transaction = true;
	}

	if ("createSession" in db) {
		let DatabaseSync: typeof import("node:sqlite").DatabaseSync | undefined =
			undefined;
		try {
			const nodeSqlite: string = "node:sqlite";
			// Ignore both Vite and Webpack for dynamic import as they both try to pre-bundle 'node:sqlite' which might fail
			// It's okay because we are in a try-catch block
			({ DatabaseSync } = await import(
				/* @vite-ignore */
				/* webpackIgnore: true */
				nodeSqlite
			));
		} catch (error: unknown) {
			if (
				error !== null &&
				typeof error === "object" &&
				"code" in error &&
				error.code !== "ERR_UNKNOWN_BUILTIN_MODULE"
			) {
				throw error;
			}
		}
		if (DatabaseSync && db instanceof DatabaseSync) {
			const { NodeSqliteDialect } = await import("./node-sqlite-dialect");
			dialect = new NodeSqliteDialect({
				database: db,
			});
			transaction = true;
		}
	}

	// Cloudflare D1
	if ("batch" in db && "exec" in db && "prepare" in db) {
		const { createD1IndexIntrospector, D1SqliteDialect } = await import(
			"./d1-sqlite-dialect"
		);
		dialect = new D1SqliteDialect({
			database: db,
		});
		introspectIndexes = createD1IndexIntrospector(db);
		// D1 has no interactive transactions; only its batch() API.
		transaction = false;
	}

	return {
		kysely: dialect ? new Kysely<any>({ dialect }) : null,
		databaseType,
		introspectIndexes,
		// A raw pool, database handle, or dialect carries no adapter options,
		// so a schema can only be declared through the object config forms.
		schemaName: undefined,
		transaction,
	};
};
