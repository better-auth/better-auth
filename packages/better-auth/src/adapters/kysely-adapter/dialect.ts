import { Kysely } from "kysely";
import {
	type Dialect,
	MysqlDialect,
	PostgresDialect,
	SqliteDialect,
} from "kysely";
import type { BetterAuthOptions } from "../../types";
import { BetterAuthError } from "../../error/better-auth-error";

export const getDialect = async (config: BetterAuthOptions) => {
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
			const pg = await import("pg").catch((e) => {
				throw new BetterAuthError(
					"Please install `pg` to use postgres database",
				);
			});
			const Pool = pg.Pool;
			dialect = new PostgresDialect({
				pool: new Pool({
					connectionString,
				}),
			});
		}
		if (provider === "mysql") {
			try {
				const { createPool } = await import("mysql2/promise").catch((e) => {
					throw new BetterAuthError(
						"Please install `mysql2` to use mysql database",
					);
				});
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
			try {
				const database = await import("better-sqlite3").catch((e) => {
					throw new BetterAuthError(
						"Please install `better-sqlite3` to use sqlite database",
					);
				});
				const Database = database.default || database;

				if (!Database) {
					throw new BetterAuthError(
						"Failed to import better-sqlite3. Please ensure `better-sqlite3` is properly installed.",
					);
				}

				const db = new Database(connectionString);
				dialect = new SqliteDialect({
					database: db,
				});
			} catch (e) {
				console.error(e);
				throw new BetterAuthError(
					"Failed to initialize SQLite. Please ensure `better-sqlite3` is properly installed.",
				);
			}
		}
	}
	return dialect;
};

export const createKyselyAdapter = async (config: BetterAuthOptions) => {
	const dialect = await getDialect(config);
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
