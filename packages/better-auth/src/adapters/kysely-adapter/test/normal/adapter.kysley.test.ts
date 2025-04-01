import merge from "deepmerge";
import fsPromises from "fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAdapterTest } from "../../../test";
import { getMigrations } from "../../../../db/get-migration";
import path from "path";
import Database from "better-sqlite3";
import { kyselyAdapter } from "../..";
import { Kysely, MysqlDialect, sql, SqliteDialect } from "kysely";
import type { BetterAuthOptions } from "../../../../types";
import { createPool } from "mysql2/promise";

import * as tedious from "tedious";
import * as tarn from "tarn";
import { MssqlDialect } from "kysely";
import { getTestInstance } from "../../../../test-utils/test-instance";
import { setState } from "../state";

const sqlite = new Database(path.join(__dirname, "test.db"));
const mysql = createPool("mysql://user:password@localhost:3306/better_auth");
const sqliteKy = new Kysely({
	dialect: new SqliteDialect({
		database: sqlite,
	}),
});
const mysqlKy = new Kysely({
	dialect: new MysqlDialect(mysql),
});
export const opts = ({
	database,
	isNumberIdTest,
}: { database: BetterAuthOptions["database"]; isNumberIdTest: boolean }) =>
	({
		database: database,
		user: {
			fields: {
				email: "email_address",
			},
			additionalFields: {
				test: {
					type: "string",
					defaultValue: "test",
				},
			},
		},
		session: {
			modelName: "sessions",
		},
		advanced: {
			database: {
				useNumberId: isNumberIdTest,
			},
		},
	}) satisfies BetterAuthOptions;

describe("adapter test", async () => {
	const mysqlOptions = opts({
		database: {
			db: mysqlKy,
			type: "mysql",
		},
		isNumberIdTest: false,
	});

	const sqliteOptions = opts({
		database: {
			db: sqliteKy,
			type: "sqlite",
		},
		isNumberIdTest: false,
	});
	beforeAll(async () => {
		setState("RUNNING");
		console.log(`Now running Number ID Kysely adapter test...`);
		await (await getMigrations(mysqlOptions)).runMigrations();
		await (await getMigrations(sqliteOptions)).runMigrations();
	});

	afterAll(async () => {
		await mysql.query("DROP DATABASE IF EXISTS better_auth");
		await mysql.query("CREATE DATABASE better_auth");
		await mysql.end();
		await fsPromises.unlink(path.join(__dirname, "test.db"));
	});

	const mysqlAdapter = kyselyAdapter(mysqlKy, {
		type: "mysql",
		debugLogs: {
			isRunningAdapterTests: true,
		},
	});
	await runAdapterTest({
		getAdapter: async (customOptions = {}) => {
			return mysqlAdapter(merge(customOptions, mysqlOptions));
		},
		testPrefix: "mysql",
	});

	const sqliteAdapter = kyselyAdapter(sqliteKy, {
		type: "sqlite",
		debugLogs: {
			isRunningAdapterTests: true,
		},
	});
	await runAdapterTest({
		getAdapter: async (customOptions = {}) => {
			return sqliteAdapter(merge(customOptions, sqliteOptions));
		},
		testPrefix: "sqlite",
	});
});

describe("mssql", async () => {
	const dialect = new MssqlDialect({
		tarn: {
			...tarn,
			options: {
				min: 0,
				max: 10,
			},
		},
		tedious: {
			...tedious,
			connectionFactory: () =>
				new tedious.Connection({
					authentication: {
						options: {
							password: "Password123!",
							userName: "sa",
						},
						type: "default",
					},
					options: {
						port: 1433,
						trustServerCertificate: true,
					},
					server: "localhost",
				}),
		},
	});
	const opts = {
		database: dialect,
		user: {
			modelName: "users",
		},
	} satisfies BetterAuthOptions;
	beforeAll(async () => {
		const { runMigrations, toBeAdded, toBeCreated } = await getMigrations(opts);
		await runMigrations();
		return async () => {
			await resetDB();
			console.log(
				`Normal Kysely adapter test finished. Now allowing number ID Kysely tests to run.`,
			);
			setState("IDLE");
		};
	});
	const mssql = new Kysely({
		dialect: dialect,
	});
	const getAdapter = kyselyAdapter(mssql, {
		type: "mssql",
		debugLogs: {
			isRunningAdapterTests: true,
		},
	});

	async function resetDB() {
		await sql`DROP TABLE dbo.session;`.execute(mssql);
		await sql`DROP TABLE dbo.verification;`.execute(mssql);
		await sql`DROP TABLE dbo.account;`.execute(mssql);
		await sql`DROP TABLE dbo.users;`.execute(mssql);
	}

	await runAdapterTest({
		getAdapter: async (customOptions = {}) => {
			// const merged = merge( customOptions,opts);
			// merged.database = opts.database;
			return getAdapter(opts);
		},
		disableTests: {
			SHOULD_PREFER_GENERATE_ID_IF_PROVIDED: true,
		},
	});

	describe("simple flow", async () => {
		const { auth } = await getTestInstance(
			{
				database: dialect,
				user: {
					modelName: "users",
				},
			},
			{
				disableTestUser: true,
			},
		);
		it("should sign-up", async () => {
			const res = await auth.api.signUpEmail({
				body: {
					name: "test",
					password: "password",
					email: "test-2@email.com",
				},
			});
			expect(res.user.name).toBe("test");
			expect(res.token?.length).toBeTruthy();
		});

		let token = "";
		it("should sign in", async () => {
			//sign in
			const signInRes = await auth.api.signInEmail({
				body: {
					password: "password",
					email: "test-2@email.com",
				},
			});

			expect(signInRes.token?.length).toBeTruthy();
			expect(signInRes.user.name).toBe("test");
			token = signInRes.token;
		});

		it("should return session", async () => {
			const session = await auth.api.getSession({
				headers: new Headers({
					Authorization: `Bearer ${token}`,
				}),
			});
			expect(session).toMatchObject({
				session: {
					token,
					userId: expect.any(String),
				},
				user: {
					name: "test",
					email: "test-2@email.com",
				},
			});
		});
	});
});
