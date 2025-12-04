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
