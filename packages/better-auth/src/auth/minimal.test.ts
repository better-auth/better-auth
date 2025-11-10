import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { memoryAdapter } from "../adapters/memory-adapter/memory-adapter";
import { betterAuth } from "./minimal";

describe("auth-minimal", () => {
	const db: Record<string, any[]> = {};

	it("should initialize with adapter without Kysely dependencies", async () => {
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(db),
		});

		expect(auth).toBeDefined();
		expect(auth.handler).toBeDefined();
		expect(auth.api).toBeDefined();
		expect(auth.options).toBeDefined();

		const ctx = await auth.$context;
		expect(ctx.adapter.id).toBe("memory");
	});

	it("should throw error when attempting to run migrations", async () => {
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(db),
		});

		const ctx = await auth.$context;
		await expect(ctx.runMigrations()).rejects.toThrow(
			"Migrations are not supported in 'better-auth/minimal'",
		);
	});

	it("should handle requests through adapter", async () => {
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(db),
		});

		const request = new Request("http://localhost:3000/api/auth/ok");
		const response = await auth.handler(request);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data).toMatchObject({ ok: true });
	});

	it("should throw error with direct database connection (Kysely required)", async () => {
		const sqliteDB = new Database(":memory:");

		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: sqliteDB, // Direct database connection that requires Kysely
		});

		await expect(auth.$context).rejects.toThrow(
			"Direct database connection requires Kysely",
		);

		sqliteDB.close();
	});
});
