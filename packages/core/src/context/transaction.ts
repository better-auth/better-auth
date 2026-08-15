import type { AsyncLocalStorage } from "node:async_hooks";
import { getAsyncLocalStorage } from "@better-auth/core/async_hooks";
import type { DBAdapter, DBTransactionAdapter } from "../db/adapter";
import type { BetterAuthOptions } from "../types";
import { __getBetterAuthGlobal } from "./global";

type StoredAdapter = DBTransactionAdapter<BetterAuthOptions>;

type HookContext = {
	adapter: StoredAdapter;
	pendingHooks: Array<() => Promise<void>>;
	isTransactionActive: boolean;
};

const ensureAsyncStorage = async () => {
	const betterAuthGlobal = __getBetterAuthGlobal();
	if (!betterAuthGlobal.context.adapterAsyncStorage) {
		const AsyncLocalStorage = await getAsyncLocalStorage();
		betterAuthGlobal.context.adapterAsyncStorage = new AsyncLocalStorage();
	}
	return betterAuthGlobal.context
		.adapterAsyncStorage as AsyncLocalStorage<HookContext>;
};

/**
 * This is for internal use only. Most users should use `getCurrentAdapter` instead.
 *
 * It is exposed for advanced use cases where you need direct access to the AsyncLocalStorage instance.
 */
export const getCurrentDBAdapterAsyncLocalStorage = async () => {
	return ensureAsyncStorage();
};

export const getCurrentAdapter = async <
	Options extends BetterAuthOptions = BetterAuthOptions,
>(
	fallback: DBTransactionAdapter<Options>,
): Promise<DBTransactionAdapter<Options>> => {
	return ensureAsyncStorage()
		.then((als) => {
			const store = als.getStore();
			return (
				(store?.adapter as DBTransactionAdapter<Options> | undefined) ||
				fallback
			);
		})
		.catch(() => {
			return fallback;
		});
};

export const runWithAdapter = async <
	R,
	Options extends BetterAuthOptions = BetterAuthOptions,
>(
	adapter: DBAdapter<Options>,
	fn: () => R,
): Promise<R> => {
	let called = false;
	return ensureAsyncStorage()
		.then(async (als) => {
			called = true;
			const pendingHooks: Array<() => Promise<void>> = [];
			let result: Awaited<R>;
			let error: unknown;
			let hasError = false;
			try {
				result = await als.run(
					{
						adapter: adapter as unknown as StoredAdapter,
						pendingHooks,
						isTransactionActive: false,
					},
					fn,
				);
			} catch (err) {
				error = err;
				hasError = true;
			}
			// Execute pending hooks after the function completes (even if it threw)
			for (const hook of pendingHooks) {
				await hook();
			}
			if (hasError) {
				throw error;
			}
			return result!;
		})
		.catch((err) => {
			if (!called) {
				return fn();
			}
			throw err;
		});
};

export const runWithTransaction = async <
	R,
	Options extends BetterAuthOptions = BetterAuthOptions,
>(
	adapter: DBAdapter<Options>,
	fn: () => R,
): Promise<R> => {
	let called = false;
	return ensureAsyncStorage()
		.then(async (als) => {
			called = true;
			const store = als.getStore();
			if (store?.isTransactionActive) {
				return fn();
			}
			const pendingHooks: Array<() => Promise<void>> = [];
			let result: Awaited<R>;
			let error: unknown;
			let hasError = false;
			try {
				result = await adapter.transaction(async (trx) => {
					return als.run(
						{
							adapter: trx as unknown as StoredAdapter,
							pendingHooks,
							isTransactionActive: true,
						},
						fn,
					);
				});
			} catch (e) {
				hasError = true;
				error = e;
			}
			for (const hook of pendingHooks) {
				await hook();
			}
			if (hasError) {
				throw error;
			}
			return result!;
		})
		.catch((err) => {
			if (!called) {
				return fn();
			}
			throw err;
		});
};

/**
 * Queue a hook to be executed after the current transaction commits.
 * If not in a transaction, the hook will execute immediately.
 */
export const queueAfterTransactionHook = async (
	hook: () => Promise<void>,
): Promise<void> => {
	return ensureAsyncStorage()
		.then((als) => {
			const store = als.getStore();
			if (store) {
				// We're in a transaction context, queue the hook
				store.pendingHooks.push(hook);
			} else {
				// Not in a transaction, execute immediately
				return hook();
			}
		})
		.catch(() => {
			// No async storage available, execute immediately
			return hook();
		});
};
