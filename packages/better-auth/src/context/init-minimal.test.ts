import { describe, expect, it } from "vitest";
import { memoryAdapter } from "../adapters/memory-adapter";
import { initMinimal } from "./init-minimal";

describe("init-minimal (without Kysely)", () => {
	const db: Record<string, any[]> = {};

	it("should initialize without Kysely dependencies", async () => {
		const res = await initMinimal({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(db),
		});

		expect(res).toBeDefined();
		expect(res.adapter.id).toBe("memory");
		expect(res.adapter.options?.type).toBeUndefined();
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

	it("should work with non-Kysely adapters like memory adapter", async () => {
		const customDb: Record<string, any[]> = {
			users: [],
			sessions: [],
		};

		const res = await initMinimal({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(customDb),
		});

		expect(res.adapter.id).toBe("memory");
		expect(res.adapter.options?.type).toBeUndefined();
	});
});
