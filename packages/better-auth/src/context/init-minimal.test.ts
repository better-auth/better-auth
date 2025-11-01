import { describe, expect, it } from "vitest";
import { memoryAdapter } from "../adapters/memory-adapter/memory-adapter";
import { initMinimal } from "./init-minimal";

describe("init-minimal", () => {
	const db: Record<string, any[]> = {};

	it("should initialize without Kysely dependencies", async () => {
		const res = await initMinimal({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(db),
		});

		expect(res).toBeDefined();
		expect(res.baseURL).toBe("http://localhost:3000/api/auth");
		expect(res.options.baseURL).toBe("http://localhost:3000");
		expect(res.adapter.id).toBe("memory");
	});

	it("should throw error when attempting to run migrations", async () => {
		const res = await initMinimal({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(db),
		});

		await expect(res.runMigrations()).rejects.toThrow(
			"Migrations are not supported in 'better-auth/minimal'",
		);
	});

	it("should work with custom base path", async () => {
		const res = await initMinimal({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(db),
			basePath: "/custom-auth",
		});

		expect(res.baseURL).toBe("http://localhost:3000/custom-auth");
	});

	it("should initialize with minimal configuration", async () => {
		const res = await initMinimal({
			database: memoryAdapter(db),
		});

		expect(res).toBeDefined();
		expect(res.adapter).toBeDefined();
		expect(res.internalAdapter).toBeDefined();
		expect(res.tables).toBeDefined();
	});
});
