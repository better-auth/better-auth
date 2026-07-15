import type { BetterAuthOptions } from "@better-auth/core";
import { runAtomicMutation } from "@better-auth/core/context";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { expect, vi } from "vitest";
import { createTestSuite } from "./create-test-suite";

function createBatchOnlyAdapter(): DBAdapter<BetterAuthOptions> {
	const adapter: DBAdapter<BetterAuthOptions> = {
		id: "batch-only",
		create: vi.fn(),
		findOne: vi.fn(),
		findMany: vi.fn(),
		count: vi.fn(),
		update: vi.fn(),
		updateMany: vi.fn(),
		delete: vi.fn(),
		deleteMany: vi.fn(),
		consumeOne: vi.fn(),
		incrementOne: vi.fn(),
		transaction: async (callback) => callback(adapter),
		commitAtomicWrites: vi.fn(async () => [
			{ type: "deleteMany" as const, deletedCount: 1 },
		]),
	};
	return adapter;
}

const batchOnlyAdapter = createBatchOnlyAdapter();

await createTestSuite("adapter wrapper capabilities", {}, ({ adapter }) => ({
	"preserves batch-only transaction capability": async () => {
		expect(adapter.options?.adapterConfig.transaction).toBe(false);
		expect(adapter.commitAtomicWrites).toBeTypeOf("function");

		const runInTransaction = vi.fn(async () => 0);
		const prepareAtomicWrites = vi.fn(async () => ({
			operations: [
				{
					type: "deleteMany" as const,
					model: "session",
					where: [],
				},
			],
			afterCommit: () => 1,
		}));

		await expect(
			runAtomicMutation(adapter, {
				prepareAtomicWrites,
				runInTransaction,
			}),
		).resolves.toBe(1);
		expect(prepareAtomicWrites).toHaveBeenCalledOnce();
		expect(runInTransaction).not.toHaveBeenCalled();
		expect(batchOnlyAdapter.commitAtomicWrites).toHaveBeenCalledOnce();
	},
}))()({
	adapter: async () => batchOnlyAdapter,
	adapterDisplayName: "Batch-only adapter",
	cleanup: async () => {},
	getBetterAuthOptions: () => ({
		secret: "test-secret-that-is-at-least-32-characters",
	}),
	log: {
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		success: vi.fn(),
		warn: vi.fn(),
	},
	modifyBetterAuthOptions: async (options) => options,
	onTestFinish: async () => {},
	runMigrations: async () => {},
});
