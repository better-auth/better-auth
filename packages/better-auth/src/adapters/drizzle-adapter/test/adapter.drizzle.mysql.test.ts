import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "./schema.mysql";
import { runAdapterTest } from "../../test";
import { drizzleAdapter } from "..";
import { getMigrations } from "../../../db/get-migration";
import { drizzle } from "drizzle-orm/mysql2";
import type { BetterAuthOptions } from "../../../types";
import { createPool, type Pool } from "mysql2/promise";
import { Kysely, MysqlDialect } from "kysely";
import { betterAuth } from "../../../auth";

const TEST_DB_MYSQL_URL = "mysql://user:password@localhost:3306/better_auth";

const createTestPool = () => createPool(TEST_DB_MYSQL_URL);

const createKyselyInstance = (pool: any) =>
	new Kysely({
		dialect: new MysqlDialect({ pool }),
	});

const cleanupDatabase = async (mysql: Pool) => {
	await mysql.query("DROP DATABASE IF EXISTS better_auth");
	await mysql.query("CREATE DATABASE better_auth");
	await mysql.end();
};

const createTestOptions = (pool: any): BetterAuthOptions => ({
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
});

describe("Drizzle Adapter Tests (MySQL)", async () => {
	let pool: any;
	let mysql: Kysely<any>;
	let opts: BetterAuthOptions;

	pool = createTestPool();
	mysql = createKyselyInstance(pool);
	opts = createTestOptions(pool);
	const { runMigrations } = await getMigrations(opts);
	await runMigrations();

	afterAll(async () => {
		await cleanupDatabase(pool);
	});

	const db = drizzle({
		client: pool,
	});
	const adapter = drizzleAdapter(db, { provider: "mysql", schema });

	await runAdapterTest({
		getAdapter: async (customOptions = {}) => {
			return adapter({ ...opts, ...customOptions });
		},
	});
});

describe("Authentication Flow Tests (MySQL)", async () => {
	const pool = createTestPool();
	let mysql: Kysely<any>;
	const opts = createTestOptions(pool);
	const testUser = {
		email: "test-email@email.com",
		password: "password",
		name: "Test Name",
	};

	beforeAll(async () => {
		mysql = createKyselyInstance(pool);
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

	afterAll(async () => {
		await cleanupDatabase(pool);
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
