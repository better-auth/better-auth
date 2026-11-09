import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { DBAdapter, DBTransactionAdapter } from "../db/adapter";
import { logger } from "../env";
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

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11639
	 */
	describe("when the adapter's transaction cannot roll back", () => {
		function createAsIsAdapter() {
			const { adapter } = createTransactionHarness();
			return {
				...adapter,
				options: { adapterConfig: { transaction: false } },
			} as unknown as DBAdapter;
		}

		it("runs queued hooks before rethrowing", async () => {
			const adapter = createAsIsAdapter();
			let hookRuns = 0;

			await expect(
				runWithTransaction(adapter, async () => {
					await queueAfterTransactionHook(async () => {
						hookRuns += 1;
					});
					throw new Error("later step failed");
				}),
			).rejects.toThrow("later step failed");

			expect(hookRuns).toBe(1);
		});

		it("logs a failing hook without a handler and still runs later hooks", async () => {
			const adapter = createAsIsAdapter();
			const error = vi.spyOn(logger, "error").mockImplementation(() => {});
			onTestFinished(() => error.mockRestore());
			const events: string[] = [];

			await expect(
				runWithTransaction(adapter, async () => {
					await queueAfterTransactionHook(async () => {
						throw new Error("cache unavailable");
					});
					await queueAfterTransactionHook(async () => {
						events.push("later hook");
					});
					throw new Error("later step failed");
				}),
			).rejects.toThrow("later step failed");

			expect(events).toEqual(["later hook"]);
			expect(error).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({ message: "cache unavailable" }),
			);
		});

		it("still runs later hooks when logging a hook failure throws", async () => {
			const adapter = createAsIsAdapter();
			const error = vi.spyOn(logger, "error").mockImplementation(() => {
				throw new Error("logger failed");
			});
			onTestFinished(() => error.mockRestore());
			const events: string[] = [];

			await expect(
				runWithTransaction(adapter, async () => {
					await queueAfterTransactionHook(async () => {
						throw new Error("cache unavailable");
					});
					await queueAfterTransactionHook(async () => {
						events.push("later hook");
					});
					throw new Error("later step failed");
				}),
			).rejects.toThrow("later step failed");

			expect(error).toHaveBeenCalledOnce();
			expect(events).toEqual(["later hook"]);
		});

		it("keeps the original error when a queued hook also fails", async () => {
			const adapter = createAsIsAdapter();
			const onAfterCommitHookError = vi.fn();
			const events: string[] = [];

			await expect(
				runWithTransaction(
					adapter,
					async () => {
						await queueAfterTransactionHook(async () => {
							throw new Error("cache unavailable");
						});
						await queueAfterTransactionHook(async () => {
							events.push("later hook");
						});
						throw new Error("later step failed");
					},
					{ onAfterCommitHookError },
				),
			).rejects.toThrow("later step failed");

			expect(onAfterCommitHookError).toHaveBeenCalledWith(
				expect.objectContaining({ message: "cache unavailable" }),
			);
			expect(events).toEqual(["later hook"]);
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11514
	 */
	it("runs only the hooks of the attempt that commits when the adapter retries the callback", async () => {
		const transactionAdapter = {} as DBTransactionAdapter;
		let attempts = 0;
		const adapter = {
			transaction: async <R>(
				callback: (trx: DBTransactionAdapter) => Promise<R>,
			) => {
				try {
					return await callback(transactionAdapter);
				} catch {
					return callback(transactionAdapter);
				}
			},
		} as DBAdapter;
		const hookRuns: number[] = [];

		await runWithTransaction(adapter, async () => {
			attempts += 1;
			const attempt = attempts;
			await queueAfterTransactionHook(async () => {
				hookRuns.push(attempt);
			});
			if (attempt === 1) {
				throw new Error("write conflict");
			}
		});

		expect(attempts).toBe(2);
		expect(hookRuns).toEqual([2]);
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

	it("reports unhandled after-commit failures and continues later committed hooks", async () => {
		const { adapter } = createTransactionHarness();
		const onAfterCommitHookError = vi.fn(() => {
			throw new Error("custom logger failed");
		});
		const events: string[] = [];

		await expect(
			runWithTransaction(
				adapter,
				async () => {
					await queueAfterTransactionHook(async () => {
						throw new Error("account after-hook failed");
					});
					await queueAfterTransactionHook(async () => {
						events.push("later hook");
					});
					return "committed";
				},
				{ onAfterCommitHookError },
			),
		).resolves.toBe("committed");
		expect(onAfterCommitHookError).toHaveBeenCalledWith(
			expect.objectContaining({ message: "account after-hook failed" }),
		);
		expect(events).toEqual(["later hook"]);
	});

	it("keeps legacy after-commit failures rejecting when no handler is provided", async () => {
		const { adapter } = createTransactionHarness();

		await expect(
			runWithTransaction(adapter, async () => {
				await queueAfterTransactionHook(async () => {
					throw new Error("legacy hook failure");
				});
				return "committed";
			}),
		).rejects.toThrow("legacy hook failure");
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
