import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { DBAdapter, DBTransactionAdapter } from "../db/adapter";
import { __getBetterAuthGlobal } from "./global";
import {
	getCurrentAdapter,
	queueAfterTransactionHook,
	runWithAdapter,
	runWithTransaction,
} from "./transaction";

function createTransactionHarness() {
	let transactionCalls = 0;
	const transactionAdapter = {} as DBTransactionAdapter;
	const adapter = {
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

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10832
	 */
	it("preserves each transaction adapter across concurrent first calls", async () => {
		vi.resetModules();
		const globalContext = __getBetterAuthGlobal().context;
		const previousStorageDescriptor = Object.getOwnPropertyDescriptor(
			globalContext,
			"adapterAsyncStorage",
		);
		onTestFinished(() => {
			if (previousStorageDescriptor) {
				Object.defineProperty(
					globalContext,
					"adapterAsyncStorage",
					previousStorageDescriptor,
				);
			} else {
				Reflect.deleteProperty(globalContext, "adapterAsyncStorage");
			}
		});
		Reflect.deleteProperty(globalContext, "adapterAsyncStorage");
		const mod = await import("./transaction");
		const harnesses = Array.from({ length: 32 }, () => {
			const transactionAdapter = {} as DBTransactionAdapter;
			const adapter = {
				transaction: async <R>(
					callback: (trx: DBTransactionAdapter) => Promise<R>,
				) => callback(transactionAdapter),
			} as DBAdapter;
			return { adapter, transactionAdapter };
		});

		const currentAdapters = await Promise.all(
			harnesses.map(({ adapter }) =>
				mod.runWithTransaction(adapter, async () => {
					await Promise.resolve();
					return mod.getCurrentAdapter(adapter);
				}),
			),
		);

		const transactionAdapterCount = currentAdapters.filter(
			(currentAdapter, index) =>
				currentAdapter === harnesses[index]?.transactionAdapter,
		).length;
		expect(transactionAdapterCount).toBe(harnesses.length);
	});
});
