import type { BetterAuthOptions } from "@better-auth/core";
import type { Dialect } from "kysely";
import {
	Kysely,
	MssqlDialect,
	MysqlDialect,
	PostgresDialect,
	SqliteDialect,
} from "kysely";
import type { KyselyDatabaseType } from "./types";

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
		return {
			kysely: db.db,
			databaseType: db.type,
			transaction: db.transaction,
		};
	}

	if ("dialect" in db) {
		return {
			kysely: new Kysely<any>({ dialect: db.dialect }),
			databaseType: db.type,
			transaction: db.transaction,
		};
	}

	let dialect: Dialect | undefined = undefined;

	const databaseType = getKyselyDatabaseType(db);

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

	if ("createSession" in db && typeof window === "undefined") {
		let DatabaseSync: typeof import("node:sqlite").DatabaseSync | undefined =
			undefined;
		try {
			let nodeSqlite: string = "node:sqlite";
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

	return {
		kysely: dialect ? new Kysely<any>({ dialect }) : null,
		databaseType,
		transaction: undefined,
	};
};
