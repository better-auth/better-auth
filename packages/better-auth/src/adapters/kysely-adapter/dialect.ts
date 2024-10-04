import { DialectAdapterBase, Kysely } from "kysely";
import {
	type Dialect,
	MysqlDialect,
	PostgresDialect,
	SqliteDialect,
} from "kysely";
import type { BetterAuthOptions } from "../../types";

export const createKyselyAdapter = async (config: BetterAuthOptions) => {
	const db = config.database;
	let dialect: Dialect | undefined = undefined;
	//TODO: on custom dialect require the user to pass the database type
	let databaseType: "sqlite" | "mysql" | "postgres" = "sqlite";

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

	if ("aggregate" in db) {
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

	if ("connect" in db) {
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
