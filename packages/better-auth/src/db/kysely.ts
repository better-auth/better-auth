import {
	Dialect,
	Kysely,
	MysqlDialect,
	PostgresDialect,
	SqliteDialect,
} from "kysely";
import { BetterAuthOptions } from "../types";
import { createPool } from "mysql2";
import { Pool } from "pg";
import Database from "better-sqlite3";

export const getDialect = (config: BetterAuthOptions) => {
	if (!config.database) {
		return null;
	}
	let dialect: Dialect | null = null;
	if ("provider" in config.database) {
		const provider = config.database.provider;
		const connectionString = config.database.url.trim();
		if (provider === "postgres") {
			const pool = new Pool({
				connectionString,
			});
			dialect = new PostgresDialect({
				pool,
			});
		}
		if (provider === "mysql") {
			const params = new URL(connectionString);
			const pool = createPool({
				host: params.hostname,
				user: params.username,
				password: params.password,
				database: params.pathname.split("/")[1],
				port: Number(params.port),
			});
			dialect = new MysqlDialect({ pool });
		}

		if (provider === "sqlite") {
			const db = new Database(connectionString.replace("sqlite://", ""));
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
		return null;
	}
	const db = new Kysely({
		dialect,
	});
	return db;
};
