import fs from "fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAdapterTest } from "../../test";
import { getMigrations } from "../../../db/get-migration";
import path from "path";
import Database from "better-sqlite3";
import { kyselyAdapter } from "..";
import { Kysely, MysqlDialect, sql, SqliteDialect } from "kysely";
import type { BetterAuthOptions } from "../../../types";
import { createPool } from "mysql2/promise";

import * as tedious from "tedious";
import * as tarn from "tarn";
import { MssqlDialect } from "kysely";
import { getTestInstance } from "../../../test-utils/test-instance";

describe("adapter test", async () => {
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
	const opts = (database: BetterAuthOptions["database"]) =>
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
		}) satisfies BetterAuthOptions;
	const mysqlOptions = opts({
		db: mysqlKy,
		type: "mysql",
	});
	const sqliteOptions = opts({
		db: sqliteKy,
		type: "sqlite",
	});
	beforeAll(async () => {
		const { runMigrations } = await getMigrations(mysqlOptions);
		await runMigrations();
		const { runMigrations: runMigrationsSqlite } =
			await getMigrations(sqliteOptions);
		await runMigrationsSqlite();
	});

	afterAll(async () => {
		await mysql.query("DROP DATABASE IF EXISTS better_auth");
		await mysql.query("CREATE DATABASE better_auth");
		await mysql.end();
		await fs.unlink(path.join(__dirname, "test.db"));
	});

	const mysqlAdapter = kyselyAdapter(mysqlKy, {
		type: "mysql",
	});
	await runAdapterTest({
		getAdapter: async (customOptions = {}) => {
			return mysqlAdapter({ ...mysqlOptions, ...customOptions });
		},
	});

	const sqliteAdapter = kyselyAdapter(sqliteKy, {
		type: "sqlite",
	});
	await runAdapterTest({
		getAdapter: async (customOptions = {}) => {
			return sqliteAdapter({ ...sqliteOptions, ...customOptions });
		},
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
		console.log({ toBeAdded, toBeCreated });
		await runMigrations();
	});
	const mssql = new Kysely({
		dialect: dialect,
	});
	const getAdapter = kyselyAdapter(mssql, {
		type: "mssql",
	});

	const adapter = getAdapter(opts);

	async function resetDB() {
		await sql`DROP TABLE dbo.session;`.execute(mssql);
		await sql`DROP TABLE dbo.verification;`.execute(mssql);
		await sql`DROP TABLE dbo.account;`.execute(mssql);
		await sql`DROP TABLE dbo.users;`.execute(mssql);
	}

	afterAll(async () => {
		await resetDB();
	});

	await runAdapterTest({
		getAdapter: async (customOptions = {}) => {
			return adapter;
		},
		skipGenerateIdTest: true,
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
