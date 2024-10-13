import { Kysely, MssqlDialect } from "kysely";
import {
	type Dialect,
	MysqlDialect,
	PostgresDialect,
	SqliteDialect,
} from "kysely";
import type { BetterAuthOptions } from "../../types";
import { logger } from "../../utils/logger";
import type { KyselyDatabaseType } from "./types";

function getDatabaseType(
	db: BetterAuthOptions["database"],
): KyselyDatabaseType | null {
	if ("dialect" in db) {
		return getDatabaseType(db.dialect as Dialect);
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

	return null;
}

export const createKyselyAdapter = async (config: BetterAuthOptions) => {
	const db = config.database;

	if ("db" in db) {
		return {
			kysely: db.db,
			databaseType: db.type,
		};
	}

	if ("dialect" in db) {
		return {
			kysely: new Kysely({ dialect: db.dialect }),
			databaseType: db.type,
		};
	}

	let dialect: Dialect | undefined = undefined;

	const databaseType = getDatabaseType(db);

	if ("createDriver" in db) {
		dialect = db;
	}

	if ("aggregate" in db) {
		dialect = new SqliteDialect({
			database: db,
		});
	}

	if ("getConnection" in db) {
		dialect = new MysqlDialect({
			pool: db,
		});
	}

	if ("connect" in db) {
		dialect = new PostgresDialect({
			pool: db,
		});
	}

	return {
		kysely: dialect ? new Kysely({ dialect }) : null,
		databaseType,
	};
};
