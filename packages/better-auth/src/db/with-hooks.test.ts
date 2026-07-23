import { describe, expect, it, vi } from "vitest";
// Import the outer factory function
import { getWithHooks } from "./with-hooks";

vi.mock("@better-auth/core/context", () => ({
	// Add the missing export here
	getCurrentAuthContext: vi.fn().mockResolvedValue({}),

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
	getCurrentAdapter: (adapter: any) => adapter,
	// Add these if your code uses them as well
	queueAfterTransactionHook: vi.fn(),
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

	it("should commit the transaction when the afterTransaction hook succeeds", async () => {
		const executionOrder: string[] = [];
		const mockAdapter = {
			executionOrder,
			transaction: vi.fn().mockImplementation(async (fn) => {
				executionOrder.push("DB: BEGIN TRANSACTION");
				const result = await fn(mockAdapter);
				executionOrder.push("DB: COMMIT");
				return result;
			}),
			create: vi.fn().mockImplementation(async () => {
				executionOrder.push("createFn");
				return { id: "user-1" };
			}),
		};

		const mockCtx = {
			options: {},
			hooks: [
				{
					source: "test-plugin",
					hooks: {
						user: {
							create: {
								afterTransaction: vi.fn().mockImplementation(async () => {
									executionOrder.push("HOOK: Running...");
									// Success path: no error thrown
								}),
							},
						},
					},
				},
			],
		};

		const hooksAPI = getWithHooks(mockAdapter as any, mockCtx as any);
		const { createWithHooks } = hooksAPI;

		// Execution
		const result = await createWithHooks({ email: "test@test.com" }, "user");

		// Verification
		expect(result).toEqual({ id: "user-1" });
		expect(executionOrder).toEqual([
			"DB: BEGIN TRANSACTION",
			"createFn",
			"HOOK: Running...",
			"DB: COMMIT", // This proves the transaction finished successfully
		]);
	});
});
