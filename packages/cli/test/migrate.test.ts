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

describe("migrate with force flag", () => {
	it("should return migrations when force is true even if tables exist", async () => {
		const db = new Database(":memory:");
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: db,
			emailAndPassword: {
				enabled: true,
			},
		});

		// First migration - create tables
		const { toBeCreated: initialTables, runMigrations } = await getMigrations(
			auth.options,
		);
		expect(initialTables.length).toBeGreaterThan(0);
		await runMigrations();

		// Without force - should return no migrations
		const { toBeCreated: noForceTables, toBeAdded: noForceFields } =
			await getMigrations(auth.options);
		expect(noForceTables.length).toBe(0);
		expect(noForceFields.length).toBe(0);

		// With force - should return migrations as if tables don't exist
		const { toBeCreated: forceTables } = await getMigrations(auth.options, {
			force: true,
		});
		expect(forceTables.length).toBeGreaterThan(0);
		expect(forceTables.map((t) => t.table)).toContain("user");
		expect(forceTables.map((t) => t.table)).toContain("session");
		expect(forceTables.map((t) => t.table)).toContain("account");
		expect(forceTables.map((t) => t.table)).toContain("verification");
	});

	it("should include plugin tables when force is true", async () => {
		const db = new Database(":memory:");
		const testPlugin = {
			id: "testPlugin",
			schema: {
				testTable: {
					fields: {
						testField: {
							type: "string",
							fieldName: "testField",
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

		// First migration - create tables
		const { runMigrations } = await getMigrations(auth.options);
		await runMigrations();

		// With force - should include plugin table
		const { toBeCreated: forceTables } = await getMigrations(auth.options, {
			force: true,
		});
		expect(forceTables.map((t) => t.table)).toContain("testTable");
	});
});
