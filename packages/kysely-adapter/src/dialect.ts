import type { BetterAuthOptions } from "@better-auth/core";
import { getDatabaseType } from "@better-auth/core/db";
import { BetterAuthError } from "@better-auth/core/error";
import type { Dialect, PostgresPool, SqliteDatabase } from "kysely";
import { Kysely, MysqlDialect, PostgresDialect, SqliteDialect } from "kysely";

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
			kysely: db.db as Kysely<any>,
			databaseType: db.type,
			transaction: db.transaction,
		};
	}

	if ("dialect" in db) {
		return {
			kysely: new Kysely<any>({ dialect: db.dialect as unknown as Dialect }),
			databaseType: db.type,
			transaction: db.transaction,
		};
	}

	if ("createDriver" in db) {
		throw new BetterAuthError(
			"Pass a Kysely dialect as `{ dialect, type }` so the database type is explicit, instead of a bare Dialect.",
		);
	}

	let dialect: Dialect | undefined = undefined;

	const databaseType = getDatabaseType(db);

	if ("aggregate" in db && !("createSession" in db)) {
		dialect = new SqliteDialect({
			database: db as unknown as SqliteDatabase,
		});
	}

	if ("getConnection" in db) {
		// @ts-expect-error - mysql2/promise
		dialect = new MysqlDialect(db);
	}

	if ("connect" in db) {
		dialect = new PostgresDialect({
			pool: db as unknown as PostgresPool,
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
	if ("batch" in db && "exec" in db && "prepare" in db) {
		const { D1SqliteDialect } = await import("./d1-sqlite-dialect");
		dialect = new D1SqliteDialect({
			database: db,
		});
	}

	return {
		kysely: dialect ? new Kysely<any>({ dialect }) : null,
		databaseType,
		transaction: undefined,
	};
};
