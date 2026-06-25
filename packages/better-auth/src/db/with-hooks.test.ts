import { describe, expect, it, vi } from "vitest";
// Import the outer factory function
import { getWithHooks } from "./with-hooks";

// 1. Mock the global dependencies (same as before)
vi.mock("./@better-auth/core/context", () => ({
	getCurrentAdapter: (adapter: any) => adapter,
}));

vi.mock("./@better-auth/core/context", () => ({
	runWithTransaction: async (adapter: any, fn: any) => {
		const executionOrder = adapter.executionOrder || [];
		executionOrder.push("DB: BEGIN TRANSACTION");
		try {
			const result = await fn();
			executionOrder.push("DB: COMMIT");
			return result;
		} catch (error) {
			executionOrder.push("DB: ROLLBACK TRIGGERED");
			throw error;
		}
	},
}));

describe("getWithHooks -> createWithHooks", () => {
	it("should execute afterTransaction hook inside the transaction block", async () => {
		const executionOrder: string[] = [];
		const mockAdapter = {
			executionOrder,
			transaction: vi.fn().mockImplementation(async (fn) => {
				executionOrder.push("DB: BEGIN TRANSACTION");
				try {
					const result = await fn(mockAdapter);
					executionOrder.push("DB: COMMIT");
					return result;
				} catch (error) {
					executionOrder.push("DB: ROLLBACK TRIGGERED");
					throw error;
				}
			}),
			create: vi.fn().mockImplementation(async () => {
				executionOrder.push("createFn");
				return { id: "user-1", email: "test@test.com" };
			}),
		};

		const mockCtx = {
			options: {}, // dummy options
			hooks: [
				{
					source: "test-plugin",
					hooks: {
						user: {
							create: {
								afterTransaction: vi.fn().mockImplementation(async () => {
									executionOrder.push("HOOK: Running...");
									throw new Error("Simulated hook failure!");
								}),
							},
						},
					},
				},
			],
		};

		const hooksAPI = getWithHooks(mockAdapter as any, mockCtx as any);

		const { createWithHooks } = hooksAPI;

		await expect(
			createWithHooks({ email: "test@test.com" }, "user"),
		).rejects.toThrow("Simulated hook failure!");

		// 6. Assert the exact behavior
		expect(executionOrder).toEqual([
			"DB: BEGIN TRANSACTION",
			"createFn",
			"HOOK: Running...",
			"DB: ROLLBACK TRIGGERED",
		]);
	});
});
