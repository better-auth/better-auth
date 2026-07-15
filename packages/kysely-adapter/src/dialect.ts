import type { BetterAuthOptions } from "@better-auth/core";
import type { Dialect } from "kysely";
import {
	Kysely,
	MssqlDialect,
	MysqlDialect,
	PostgresDialect,
	SqliteDialect,
} from "kysely";
import {
	getD1Database,
	registerKyselyD1Database,
} from "./d1-database-registry";
import type { KyselyDatabaseType } from "./types";

type DynamicKyselyDatabaseSchema = Record<string, Record<string, unknown>>;

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

export const createKyselyAdapter = async (config: BetterAuthOptions) => {
	const db = config.database;

	if (!db) {
		return {
			kysely: null,
			databaseType: null,
			transaction: undefined,
		};
	}

	if ("db" in db) {
		const d1Database = getD1Database(db.d1Database);
		if (d1Database) {
			registerKyselyD1Database(db.db, d1Database);
		}
		return {
			kysely: db.db,
			databaseType: db.type,
			transaction: d1Database ? false : (db.transaction ?? true),
		};
	}

	if ("dialect" in db) {
		const kysely = new Kysely<DynamicKyselyDatabaseSchema>({
			dialect: db.dialect,
		});
		const d1Database = getD1Database(db.d1Database);
		if (d1Database) {
			registerKyselyD1Database(kysely, d1Database);
		}
		return {
			kysely,
			databaseType: db.type,
			transaction: d1Database ? false : (db.transaction ?? true),
		};
	}

	let dialect: Dialect | undefined = undefined;

	const databaseType = getKyselyDatabaseType(db);
	const d1Database = getD1Database(db);
	const supportsTransactions = !d1Database;

	if ("createDriver" in db) {
		dialect = db;
	}

	if ("aggregate" in db && !("createSession" in db)) {
		dialect = new SqliteDialect({
			database: db,
		});
	}

	if ("getConnection" in db) {
		// @ts-expect-error - mysql2/promise
		dialect = new MysqlDialect(db);
	}

	if ("connect" in db) {
		dialect = new PostgresDialect({
			pool: db,
		});
	}

	if ("fileControl" in db) {
		const { BunSqliteDialect } = await import("./bun-sqlite-dialect");
		dialect = new BunSqliteDialect({
			database: db,
		});
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
		}
	}

	// Cloudflare D1
	if (d1Database) {
		const { D1SqliteDialect } = await import("./d1-sqlite-dialect");
		dialect = new D1SqliteDialect({
			database: d1Database,
		});
	}

	const kysely = dialect
		? new Kysely<DynamicKyselyDatabaseSchema>({ dialect })
		: null;
	if (kysely && d1Database) {
		registerKyselyD1Database(kysely, d1Database);
	}

	return {
		kysely,
		databaseType,
		transaction: dialect ? supportsTransactions : undefined,
	};
};
