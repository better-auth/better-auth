import { Kysely } from "kysely";
import {
	type Dialect,
	MysqlDialect,
	PostgresDialect,
	SqliteDialect,
} from "kysely";
import type { BetterAuthOptions } from "../../types";
import Database from "better-sqlite3";
import { Pool as PostgresPool } from "pg";

export const createKyselyAdapter = async (config: BetterAuthOptions) => {
	const db = config.database;
	let dialect: Dialect | undefined = undefined;
	let databaseType: "sqlite" | "mysql" | "postgres" | undefined = undefined;
	if ("createDriver" in db) {
		dialect = db;
		if (dialect instanceof SqliteDialect) {
			databaseType = "sqlite";
		}
		if (dialect instanceof MysqlDialect) {
			databaseType = "mysql";
		}
		if (dialect instanceof PostgresDialect) {
			databaseType = "postgres";
		}
	}

	if (db instanceof Database) {
		dialect = new SqliteDialect({
			database: db,
		});
		databaseType = "sqlite";
	}

	if ("getConnection" in db) {
		dialect = new MysqlDialect({
			pool: db,
		});
		databaseType = "mysql";
	}

	if (db instanceof PostgresPool) {
		dialect = new PostgresDialect({
			pool: db,
		});
		databaseType = "postgres";
	}

	return {
		kysely: dialect ? new Kysely({ dialect }) : null,
		dialect,
		databaseType,
	};
};
