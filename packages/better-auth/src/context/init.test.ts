import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { init } from "./init";

describe("init (with Kysely)", () => {
	const database = new Database(":memory:");

	it("should initialize with Kysely adapter", async () => {
		const res = await init({
			baseURL: "http://localhost:3000",
			database,
		});

		expect(res.adapter.id).toBe("kysely");
		expect(res.adapter.options?.type).toBe("sqlite");
		expect(res.adapter.options?.adapterConfig?.adapterId).toBe("kysely");
	});

	it("should support runMigrations with Kysely", async () => {
		const res = await init({
			baseURL: "http://localhost:3000",
			database,
		});

		expect(res.runMigrations).toBeDefined();
		expect(typeof res.runMigrations).toBe("function");
		await expect(res.runMigrations()).resolves.not.toThrow();
	});

	it("should detect Kysely dialect from database instance", async () => {
		const res = await init({
			baseURL: "http://localhost:3000",
			database,
		});

		expect(res.adapter.options?.adapterConfig).toBeDefined();
		expect(res.adapter.options?.adapterConfig?.adapterId).toBe("kysely");
		expect(res.adapter.options?.adapterConfig?.adapterName).toBe(
			"Kysely Adapter",
		);
		expect(res.adapter.options?.type).toBe("sqlite");
	});
});
