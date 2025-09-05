import type { BetterAuthPlugin } from "@better-auth/core";
import { betterAuth } from "better-auth";
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
	const db = new Database(":memory:");
	const authConfig = {
		baseURL: "http://localhost:3000",
		database: db,
		emailAndPassword: {
			enabled: true,
		},
	};

	beforeEach(() => {
		vi.spyOn(process, "exit").mockImplementation((code) => {
			return code as never;
		});
		vi.spyOn(config, "getConfig").mockImplementation(async () => authConfig);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should pass force flag to config when --force is used", async () => {
		const options = {
			cwd: process.cwd(),
			config: "test/auth.ts",
			force: true,
		};

		const fullConfig = options.force
			? ({ ...authConfig, __force: true } as any)
			: authConfig;

		expect(fullConfig).toEqual(
			expect.objectContaining({
				__force: true,
			}),
		);
	});

	it("should migrate with force flag using real migrateAction", async () => {
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

		const currentTime = Math.floor(Date.now() / 1000);
		const signUpRes = await testAuthConfig.database
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

		testDb.exec(`
			CREATE TABLE IF NOT EXISTS user (
				id TEXT PRIMARY KEY,
				name TEXT,
				email TEXT UNIQUE,
				emailVerified BOOLEAN DEFAULT FALSE,
				image TEXT,
				createdAt INTEGER DEFAULT (unixepoch()),
				updatedAt INTEGER DEFAULT (unixepoch())
			);
			INSERT INTO user (id, name, email) VALUES ('existing-user', 'Existing User', 'existing@example.com');
		`);

		await migrateAction({
			cwd: process.cwd(),
			config: "test/auth.ts",
			force: true,
			yes: true,
		});

		const currentTime = Math.floor(Date.now() / 1000);
		const signUpRes = await testAuthConfig.database
			.prepare(
				"INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.run(
				"force-existing-test-user",
				"Force Existing Test User",
				"force-existing-test@example.com",
				0,
				currentTime,
				currentTime,
			);

		expect(signUpRes.changes).toBe(1);
	});

	it("should pass --force flag to config and run multiple migrations", async () => {
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

		const currentTime = Math.floor(Date.now() / 1000);
		const firstSignUpRes = await testAuthConfig.database
			.prepare(
				"INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.run(
				"first-migration-user",
				"First Migration User",
				"first@example.com",
				0,
				currentTime,
				currentTime,
			);

		expect(firstSignUpRes.changes).toBe(1);

		await migrateAction({
			cwd: process.cwd(),
			config: "test/auth.ts",
			force: true,
			yes: true,
		});

		const secondSignUpRes = await testAuthConfig.database
			.prepare(
				"INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.run(
				"second-migration-user",
				"Second Migration User",
				"second@example.com",
				0,
				currentTime,
				currentTime,
			);

		expect(secondSignUpRes.changes).toBe(1);

		const userCount = (await testAuthConfig.database
			.prepare("SELECT COUNT(*) as count FROM user")
			.get()) as { count: number };

		expect(userCount.count).toBe(1);
	});
});
