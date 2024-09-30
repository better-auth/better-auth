import Database from "better-sqlite3";
import { Kysely } from "kysely";
import {
	type Dialect,
	MysqlDialect,
	PostgresDialect,
	SqliteDialect,
} from "kysely";
import { createPool } from "mysql2";
import type { BetterAuthOptions } from "../../types";
import pg from "pg";
import { BetterAuthError } from "../../error/better-auth-error";

const { Pool } = pg;

export const getDialect = (config: BetterAuthOptions) => {
	if (!config.database) {
		return undefined;
	}
	if ("createDriver" in config.database) {
		return config.database;
	}
	let dialect: Dialect | undefined = undefined;
	if ("provider" in config.database) {
		const provider = config.database.provider;
		const connectionString = config.database?.url?.trim();
		if (provider === "postgres") {
			dialect = new PostgresDialect({
				pool: new Pool({
					connectionString,
				}),
			});
		}
		if (provider === "mysql") {
			try {
				const params = new URL(connectionString);
				const pool = createPool({
					host: params.hostname,
					user: params.username,
					password: params.password,
					database: params.pathname.split("/")[1],
					port: Number(params.port),
				});
				dialect = new MysqlDialect({ pool });
			} catch (e) {
				if (e instanceof TypeError) {
					throw new BetterAuthError("Invalid database URL");
				}
			}
		}

		if (provider === "sqlite") {
			const db = new Database(connectionString);
			dialect = new SqliteDialect({
				database: db,
			});
		}
	}
	return dialect;
};

export const createKyselyAdapter = (config: BetterAuthOptions) => {
	const dialect = getDialect(config);
	if (!dialect) {
		return dialect;
	}
	const db = new Kysely<any>({
		dialect,
	});
	return db;
};

export const getDatabaseType = (config: BetterAuthOptions) => {
	if ("provider" in config.database) {
		return config.database.provider;
	}
	if ("dialect" in config.database) {
		if (config.database.dialect instanceof PostgresDialect) {
			return "postgres";
		}
		if (config.database.dialect instanceof MysqlDialect) {
			return "mysql";
		}
		if (config.database.dialect instanceof SqliteDialect) {
			return "sqlite";
		}
	}
	return "sqlite";
};
