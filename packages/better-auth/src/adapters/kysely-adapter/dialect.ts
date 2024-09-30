import { Kysely } from "kysely";
import {
	type Dialect,
	MysqlDialect,
	PostgresDialect,
	SqliteDialect,
} from "kysely";
import type { BetterAuthOptions } from "../../types";
import {
	BetterAuthError,
	MissingDependencyError,
} from "../../error/better-auth-error";
import { execa } from "execa";
import prompts from "prompts";
import { getPackageManager } from "../../cli/utils/get-package-manager";
import ora from "ora";

export const getDialect = async (
	config: BetterAuthOptions,
	isCli?: boolean,
) => {
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
			const pg = await import("pg").catch(async (e) => {
				throw new MissingDependencyError("pg");
			});
			const Pool = pg.default?.Pool || pg.Pool;
			const pool = new Pool({
				connectionString,
			});
			dialect = new PostgresDialect({
				pool,
			});
		}
		if (provider === "mysql") {
			try {
				const { createPool } = await import("mysql2/promise").catch(
					async (e) => {
						throw new MissingDependencyError("mysql2");
					},
				);

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
				throw e;
			}
		}

		if (provider === "sqlite") {
			try {
				const database = await import("better-sqlite3").catch(async (e) => {
					throw new MissingDependencyError("better-sqlite3");
				});
				const Database = database.default || database;

				const db = new Database(connectionString);
				dialect = new SqliteDialect({
					database: db,
				});
			} catch (e) {
				console.error(e);
				throw new BetterAuthError(
					"Failed to initialize SQLite. Make sure `better-sqlite3` is properly installed.",
				);
			}
		}
	}
	return dialect;
};

export const createKyselyAdapter = async (
	config: BetterAuthOptions,
	isCli?: boolean,
) => {
	const dialect = await getDialect(config, isCli);
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
