import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "./schema.mysql";
import { runAdapterTest, runNumberIdAdapterTest } from "../../test";
import { drizzleAdapter } from "..";
import { getMigrations } from "../../../db/get-migration";
import { drizzle } from "drizzle-orm/mysql2";
import type { BetterAuthOptions } from "../../../types";
import { createPool, type Pool } from "mysql2/promise";
import { Kysely, MysqlDialect } from "kysely";
import { betterAuth } from "../../../auth";
import merge from "deepmerge";

const TEST_DB_MYSQL_URL = "mysql://user:password@localhost:3306/better_auth";

const createTestPool = () => createPool(TEST_DB_MYSQL_URL);

const createKyselyInstance = (pool: any) =>
	new Kysely({
		dialect: new MysqlDialect({ pool }),
	});

const cleanupDatabase = async (mysql: Pool, shouldDestroy = true) => {
	try {
		await mysql.query("DROP DATABASE IF EXISTS better_auth");
		await mysql.query("CREATE DATABASE better_auth");
		await mysql.query("USE better_auth");
	} catch (error) {
		console.log(error);
	}
	if (shouldDestroy) {
		await mysql.end();
	} else {
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
};

const createTestOptions = (pool: any, useNumberId = false) =>
	({
		database: pool,
		user: {
			fields: { email: "email_address" },
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
				useNumberId,
			},
		},
	}) satisfies BetterAuthOptions;

describe("Drizzle Adapter Tests (MySQL)", async () => {
	let pool: any;
	let mysql: Kysely<any>;

	pool = createTestPool();
	mysql = createKyselyInstance(pool);
	let opts = createTestOptions(pool);
	const { runMigrations } = await getMigrations(opts);
	await runMigrations();

	const db = drizzle({
		client: pool,
	});
	const adapter = drizzleAdapter(db, {
		provider: "mysql",
		schema,
		debugLogs: {
			isRunningAdapterTests: true,
		},
	});

	await runAdapterTest({
		getAdapter: async (customOptions = {}) => {
			const db = opts.database;
			opts.database = undefined;
			const merged = merge(opts, customOptions);
			merged.database = db;
			return adapter(merged);
		},
	});
});

describe("Drizzle Adapter Authentication Flow Tests (MySQL)", async () => {
	const pool = createTestPool();
	const opts = createTestOptions(pool);
	const testUser = {
		email: "test-email@email.com",
		password: "password",
		name: "Test Name",
	};

	beforeAll(async () => {
		const { runMigrations } = await getMigrations(opts);
		await runMigrations();
	});

	const auth = betterAuth({
		...opts,
		database: drizzleAdapter(drizzle({ client: pool }), {
			provider: "mysql",
			schema,
		}),
		emailAndPassword: {
			enabled: true,
		},
	});

	it("should successfully sign up a new user", async () => {
		const user = await auth.api.signUpEmail({ body: testUser });
		expect(user).toBeDefined();
		expect(user.user.id).toBeDefined();
	});

	it("should successfully sign in an existing user", async () => {
		const user = await auth.api.signInEmail({ body: testUser });
		expect(user.user).toBeDefined();
		expect(user.user.id).toBeDefined();
	});
});

describe("Drizzle Adapter Number Id Test (MySQL)", async () => {
	let pool: any;
	let mysql: Kysely<any>;

	pool = createTestPool();
	mysql = createKyselyInstance(pool);
	let opts = createTestOptions(pool, true);

	beforeAll(async () => {
		await cleanupDatabase(pool, false);
		const { runMigrations } = await getMigrations(opts);
		await runMigrations();
	});

	afterAll(async () => {
		await cleanupDatabase(pool);
	});

	const db = drizzle({
		client: pool,
	});
	const adapter = drizzleAdapter(db, {
		provider: "mysql",
		schema,
		debugLogs: {
			isRunningAdapterTests: true,
		},
	});

	await runNumberIdAdapterTest({
		getAdapter: async (customOptions = {}) => {
			const db = opts.database;
			opts.database = undefined;
			const merged = merge(opts, customOptions);
			merged.database = db;
			return adapter(merged);
		},
	});
});
