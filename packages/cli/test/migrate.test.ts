import type { BetterAuthPlugin } from "@better-auth/core";
import { betterAuth } from "better-auth";
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("migrate an index-only schema change", () => {
	const db = new Database(":memory:");
	const basePlugin = {
		id: "directory",
		schema: {
			directoryUser: {
				fields: {
					connectionId: { type: "string" },
					externalId: { type: "string" },
				},
			},
		},
	} satisfies BetterAuthPlugin;
	const indexedPlugin = {
		...basePlugin,
		schema: {
			directoryUser: {
				...basePlugin.schema.directoryUser,
				indexes: [
					{
						fields: ["connectionId", "externalId"],
						unique: true,
					},
				],
			},
		},
	} satisfies BetterAuthPlugin;
	let options = betterAuth({ database: db, plugins: [basePlugin] }).options;

	beforeEach(() => {
		vi.spyOn(process, "exit").mockImplementation((code) => code as never);
		vi.spyOn(config, "getConfig").mockImplementation(async () => options);
	});

	it("runs when only a compound index is missing", async () => {
		await migrateAction({ cwd: process.cwd(), yes: true });
		options = betterAuth({ database: db, plugins: [indexedPlugin] }).options;
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

		await migrateAction({ cwd: process.cwd(), yes: true });

		expect(consoleLog).not.toHaveBeenCalledWith("🚀 No migrations needed.");
		db.prepare(
			"INSERT INTO directoryUser (id, connectionId, externalId) VALUES (?, ?, ?)",
		).run("du1", "okta", "employee-1");
		expect(() =>
			db
				.prepare(
					"INSERT INTO directoryUser (id, connectionId, externalId) VALUES (?, ?, ?)",
				)
				.run("du2", "okta", "employee-1"),
		).toThrow();
	});
});
