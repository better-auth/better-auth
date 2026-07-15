import { describe, expect, it, vi } from "vitest";
import type { DBAdapter, DBTransactionAdapter } from "../db/adapter";
import {
	ATOMIC_WRITES_UNSUPPORTED,
	getCurrentAdapter,
	isAtomicWritesUnsupportedError,
	queueAfterTransactionHook,
	runAtomicMutation,
	runWithAdapter,
	runWithTransaction,
} from "./transaction";

function createTransactionHarness() {
	let transactionCalls = 0;
	const transactionAdapter = {} as DBTransactionAdapter;
	const adapter = {
		id: "test-adapter",
		transaction: async <R>(
			callback: (trx: DBTransactionAdapter) => Promise<R>,
		) => {
			transactionCalls += 1;
			return callback(transactionAdapter);
		},
	} as DBAdapter;

	return {
		adapter,
		transactionAdapter,
		getTransactionCalls: () => transactionCalls,
	};
}

describe("runWithTransaction", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/9869
	 */
	it("reuses the active transaction for nested calls", async () => {
		const { adapter, transactionAdapter, getTransactionCalls } =
			createTransactionHarness();
		const adapters: DBTransactionAdapter[] = [];

		await runWithTransaction(adapter, async () => {
			adapters.push(await getCurrentAdapter(adapter));

			await runWithTransaction(adapter, async () => {
				adapters.push(await getCurrentAdapter(adapter));
			});
		});

		expect(getTransactionCalls()).toBe(1);
		expect(adapters).toEqual([transactionAdapter, transactionAdapter]);
	});

	it("still opens a transaction from a plain adapter context", async () => {
		const { adapter, transactionAdapter, getTransactionCalls } =
			createTransactionHarness();
		let activeAdapter: DBTransactionAdapter | null = null;

		await runWithAdapter(adapter, () =>
			runWithTransaction(adapter, async () => {
				activeAdapter = await getCurrentAdapter(adapter);
			}),
		);

		expect(getTransactionCalls()).toBe(1);
		expect(activeAdapter).toBe(transactionAdapter);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10390#discussion_r3585595438
	 */
	it("runs after-transaction hooks immediately in a plain adapter context", async () => {
		const { adapter } = createTransactionHarness();
		const events: string[] = [];

		await runWithAdapter(adapter, async () => {
			events.push("before");
			await queueAfterTransactionHook(async () => {
				events.push("hook");
			});
			events.push("after");
		});

		expect(events).toEqual(["before", "hook", "after"]);
	});

	it("runs hooks queued by nested calls after the outer transaction finishes", async () => {
		const { adapter, getTransactionCalls } = createTransactionHarness();
		let hookRuns = 0;
		let hookRunsInsideTransaction = 0;

		await runWithTransaction(adapter, async () => {
			await runWithTransaction(adapter, async () => {
				await queueAfterTransactionHook(async () => {
					hookRuns += 1;
				});
			});

			hookRunsInsideTransaction = hookRuns;
		});

		expect(getTransactionCalls()).toBe(1);
		expect(hookRunsInsideTransaction).toBe(0);
		expect(hookRuns).toBe(1);
	});

	it("discards queued hooks when the transaction rolls back", async () => {
		const { adapter } = createTransactionHarness();
		let hookRuns = 0;

		await expect(
			runWithTransaction(adapter, async () => {
				await queueAfterTransactionHook(async () => {
					hookRuns += 1;
				});
				throw new Error("rollback");
			}),
		).rejects.toThrow("rollback");

		expect(hookRuns).toBe(0);
	});

	it("reports a handled after-commit hook failure without rejecting committed work", async () => {
		const { adapter } = createTransactionHarness();
		const onError = vi.fn();

		await expect(
			runWithTransaction(adapter, async () => {
				await queueAfterTransactionHook(
					async () => {
						throw new Error("cache unavailable");
					},
					{ onError },
				);
				return "committed";
			}),
		).resolves.toBe("committed");
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: "cache unavailable" }),
		);
	});

	it("does not retry an immediately executed hook when it fails", async () => {
		const hook = vi.fn(async () => {
			throw new Error("hook failed");
		});

		await expect(queueAfterTransactionHook(hook)).rejects.toThrow(
			"hook failed",
		);
		expect(hook).toHaveBeenCalledOnce();
	});
});

describe("runAtomicMutation", () => {
	it("prefers a declared native transaction without preparing atomic writes", async () => {
		const { adapter, getTransactionCalls } = createTransactionHarness();
		adapter.options = {
			adapterConfig: {
				adapterId: "native-test",
				transaction: adapter.transaction,
			},
		};
		adapter.commitAtomicWrites = vi.fn(async () => []);
		const runInTransaction = vi.fn(async () => "native");
		const prepareAtomicWrites = vi.fn();

		await expect(
			runAtomicMutation(adapter, {
				runInTransaction,
				prepareAtomicWrites,
			}),
		).resolves.toBe("native");

		expect(getTransactionCalls()).toBe(1);
		expect(runInTransaction).toHaveBeenCalledOnce();
		expect(prepareAtomicWrites).not.toHaveBeenCalled();
		expect(adapter.commitAtomicWrites).not.toHaveBeenCalled();
	});

	it("commits explicit writes and resolves their committed results", async () => {
		const { adapter, getTransactionCalls } = createTransactionHarness();
		adapter.options = {
			adapterConfig: {
				adapterId: "batch-test",
				transaction: false,
			},
		};
		const operations = [
			{
				type: "create" as const,
				model: "user",
				data: { id: "user-id", name: "Ada" },
				forceAllowId: true,
			},
		];
		const committedResults = [
			{
				type: "create" as const,
				record: { id: "user-id", name: "Ada", databaseDefault: true },
			},
		];
		adapter.commitAtomicWrites = vi.fn(async () => committedResults);
		const runInTransaction = vi.fn(async () => committedResults[0]!.record);
		const afterCommit = vi.fn(async () => committedResults[0]!.record);

		await expect(
			runAtomicMutation(adapter, {
				runInTransaction,
				prepareAtomicWrites: async () => ({ operations, afterCommit }),
			}),
		).resolves.toEqual({
			id: "user-id",
			name: "Ada",
			databaseDefault: true,
		});

		expect(getTransactionCalls()).toBe(0);
		expect(runInTransaction).not.toHaveBeenCalled();
		expect(adapter.commitAtomicWrites).toHaveBeenCalledWith(operations);
		expect(afterCommit).toHaveBeenCalledWith(committedResults);
	});

	it("does not run post-commit work when the atomic commit fails", async () => {
		const { adapter } = createTransactionHarness();
		adapter.options = {
			adapterConfig: {
				adapterId: "batch-test",
				transaction: false,
			},
		};
		const commitError = new Error("batch rolled back");
		adapter.commitAtomicWrites = vi.fn(async () => {
			throw commitError;
		});
		const afterCommit = vi.fn();

		await expect(
			runAtomicMutation(adapter, {
				runInTransaction: async () => "native",
				prepareAtomicWrites: async () => ({
					operations: [
						{
							type: "delete",
							model: "user",
							where: [{ field: "id", value: "user-id" }],
						},
					],
					afterCommit,
				}),
			}),
		).rejects.toBe(commitError);
		expect(afterCommit).not.toHaveBeenCalled();
	});

	it("resolves an empty plan without calling the adapter", async () => {
		const { adapter } = createTransactionHarness();
		adapter.options = {
			adapterConfig: {
				adapterId: "batch-test",
				transaction: false,
			},
		};
		adapter.commitAtomicWrites = vi.fn(async () => []);
		const afterCommit = vi.fn(async () => "unchanged");

		await expect(
			runAtomicMutation(adapter, {
				runInTransaction: async () => "native",
				prepareAtomicWrites: async () => ({
					operations: [],
					afterCommit,
				}),
			}),
		).resolves.toBe("unchanged");
		expect(adapter.commitAtomicWrites).not.toHaveBeenCalled();
		expect(afterCommit).toHaveBeenCalledWith([]);
	});

	it("fails before either mutation branch when no atomic capability exists", async () => {
		const { adapter, getTransactionCalls } = createTransactionHarness();
		adapter.options = {
			adapterConfig: {
				adapterId: "sequential-test",
				transaction: false,
			},
		};
		const runInTransaction = vi.fn(async () => "native");
		const prepareAtomicWrites = vi.fn();

		let thrownError: unknown;
		try {
			await runAtomicMutation(adapter, {
				runInTransaction,
				prepareAtomicWrites,
			});
		} catch (error) {
			thrownError = error;
		}

		expect(isAtomicWritesUnsupportedError(thrownError)).toBe(true);
		expect(thrownError).toMatchObject({
			code: ATOMIC_WRITES_UNSUPPORTED,
			adapterId: "test-adapter",
		});
		expect(getTransactionCalls()).toBe(0);
		expect(runInTransaction).not.toHaveBeenCalled();
		expect(prepareAtomicWrites).not.toHaveBeenCalled();
	});
});
