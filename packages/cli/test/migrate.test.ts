import type { BetterAuthPlugin } from "@better-auth/core";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateAction } from "../src/commands/migrate";
import * as config from "../src/utils/get-config";

describe("migrate base auth instance", () => {
	const db = new Database(":memory:");

	const auth = betterAuth({
		baseURL: "http://localhost:3000",
		database: db,
		emailAndPassword: {
			enabled: true,
		},
	});

	beforeEach(() => {
		vi.spyOn(process, "exit").mockImplementation((code) => {
			return code as never;
		});
		vi.spyOn(config, "getConfig").mockImplementation(async () => auth.options);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
	});

	it("should migrate the database and sign-up a user", async () => {
		await migrateAction({
			cwd: process.cwd(),
			config: "test/auth.ts",
			yes: true,
		});
		const signUpRes = await auth.api.signUpEmail({
			body: {
				name: "test",
				email: "test@email.com",
				password: "password",
			},
		});
		expect(signUpRes.token).toBeDefined();
	});
});

describe("migrate auth instance with plugins", () => {
	const db = new Database(":memory:");
	const testPlugin = {
		id: "plugin",
		schema: {
			plugin: {
				fields: {
					test: {
						type: "string",
						fieldName: "test",
					},
				},
			},
		},
	} satisfies BetterAuthPlugin;

	const auth = betterAuth({
		baseURL: "http://localhost:3000",
		database: db,
		emailAndPassword: {
			enabled: true,
		},
		plugins: [testPlugin],
	});

	beforeEach(() => {
		vi.spyOn(process, "exit").mockImplementation((code) => {
			return code as never;
		});
		vi.spyOn(config, "getConfig").mockImplementation(async () => auth.options);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
	});

	it("should migrate the database and sign-up a user", async () => {
		await migrateAction({
			cwd: process.cwd(),
			config: "test/auth.ts",
			yes: true,
		});
		const res = db
			.prepare("INSERT INTO plugin (id, test) VALUES (?, ?)")
			.run("1", "test");
		expect(res.changes).toBe(1);
	});
});

describe("migrate command with force flag", () => {
	beforeEach(() => {
		vi.spyOn(process, "exit").mockImplementation((code) => {
			return code as never;
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should pass force flag to config when --force is used", async () => {
		const testDb = new Database(":memory:");
		const testAuthConfig = {
			baseURL: "http://localhost:3000",
			database: testDb,
			emailAndPassword: {
				enabled: true,
			},
		};

		vi.spyOn(config, "getConfig").mockImplementation(
			async () => testAuthConfig,
		);

		await migrateAction({
			cwd: process.cwd(),
			config: "test/auth.ts",
			force: true,
			yes: true,
		});

		// Verify that user table exists and we can insert
		const currentTime = Math.floor(Date.now() / 1000);
		const signUpRes = testDb
			.prepare(
				"INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.run(
				"force-test-user",
				"Force Test User",
				"force-test@example.com",
				0,
				currentTime,
				currentTime,
			);

		expect(signUpRes.changes).toBe(1);
	});

	it("should handle force flag with existing database tables", async () => {
		const testDb = new Database(":memory:");
		const testAuthConfig = {
			baseURL: "http://localhost:3000",
			database: testDb,
			emailAndPassword: {
				enabled: true,
			},
		};

		vi.spyOn(config, "getConfig").mockImplementation(
			async () => testAuthConfig,
		);

		// Create tables manually first
		testDb.exec(`
			CREATE TABLE IF NOT EXISTS user (
				id TEXT PRIMARY KEY,
				name TEXT,
				email TEXT UNIQUE,
				emailVerified INTEGER DEFAULT 0,
				image TEXT,
				createdAt INTEGER DEFAULT (unixepoch()),
				updatedAt INTEGER DEFAULT (unixepoch())
			);
			INSERT INTO user (id, name, email) VALUES ('existing-user', 'Existing User', 'existing@example.com');
		`);

		// Run migration with force flag - should drop and recreate tables
		await migrateAction({
			cwd: process.cwd(),
			config: "test/auth.ts",
			force: true,
			yes: true,
		});

		// The old data should be gone after force migration
		const userCount = testDb
			.prepare("SELECT COUNT(*) as count FROM user")
			.get() as { count: number };
		expect(userCount.count).toBe(0);
	});

	it("should run multiple migrations with force flag", async () => {
		const testDb = new Database(":memory:");
		const testAuthConfig = {
			baseURL: "http://localhost:3000",
			database: testDb,
			emailAndPassword: {
				enabled: true,
			},
		};

		vi.spyOn(config, "getConfig").mockImplementation(
			async () => testAuthConfig,
		);

		// First migration
		await migrateAction({
			cwd: process.cwd(),
			config: "test/auth.ts",
			force: true,
			yes: true,
		});

		// Insert some data
		const currentTime = Math.floor(Date.now() / 1000);
		testDb
			.prepare(
				"INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.run(
				"first-user",
				"First User",
				"first@example.com",
				0,
				currentTime,
				currentTime,
			);

		// Second migration with force - should drop and recreate
		await migrateAction({
			cwd: process.cwd(),
			config: "test/auth.ts",
			force: true,
			yes: true,
		});

		// Old data should be gone
		const userCount = testDb
			.prepare("SELECT COUNT(*) as count FROM user")
			.get() as { count: number };
		expect(userCount.count).toBe(0);
	});
});

describe("getMigrations with force option", () => {
	it("should return toBeCreated for all tables when force is true", async () => {
		const testDb = new Database(":memory:");
		const testAuthConfig = {
			baseURL: "http://localhost:3000",
			database: testDb,
			emailAndPassword: {
				enabled: true,
			},
		};

		// First create the tables
		const { runMigrations: firstRun } = await getMigrations(testAuthConfig);
		await firstRun();

		// Without force, no migrations needed
		const { toBeCreated: withoutForce } = await getMigrations(testAuthConfig);
		expect(withoutForce.length).toBe(0);

		// With force, all tables should be in toBeCreated
		const { toBeCreated: withForce } = await getMigrations(testAuthConfig, {
			force: true,
		});
		expect(withForce.length).toBeGreaterThan(0);
	});

	it("should include drop statements in compileMigrations when force is true", async () => {
		const testDb = new Database(":memory:");
		const testAuthConfig = {
			baseURL: "http://localhost:3000",
			database: testDb,
			emailAndPassword: {
				enabled: true,
			},
		};

		// First create the tables
		const { runMigrations: firstRun } = await getMigrations(testAuthConfig);
		await firstRun();

		// Compile migrations with force
		const { compileMigrations } = await getMigrations(testAuthConfig, {
			force: true,
		});
		const sql = await compileMigrations();

		// Should contain DROP TABLE statements
		expect(sql.toLowerCase()).toContain("drop table");
	});
});
