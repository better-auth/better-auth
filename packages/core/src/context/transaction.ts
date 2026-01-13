import type { AsyncLocalStorage } from "@better-auth/core/async_hooks";
import { getAsyncLocalStorage } from "@better-auth/core/async_hooks";
import type { DBAdapter, DBTransactionAdapter } from "../db/adapter";

const symbol = Symbol.for("better-auth:transaction-adapter-async-storage");

let currentAdapterAsyncStorage: AsyncLocalStorage<DBTransactionAdapter> | null =
	null;

const ensureAsyncStorage = async () => {
	if (
		!currentAdapterAsyncStorage ||
		(globalThis as any)[symbol] === undefined
	) {
		const AsyncLocalStorage = await getAsyncLocalStorage();
		currentAdapterAsyncStorage = new AsyncLocalStorage();
		(globalThis as any)[symbol] = currentAdapterAsyncStorage;
	}
	return (
		currentAdapterAsyncStorage ||
		((globalThis as any)[symbol] as AsyncLocalStorage<DBTransactionAdapter>)
	);
};

/**
 * This is for internal use only. Most users should use `getCurrentAdapter` instead.
 *
 * It is exposed for advanced use cases where you need direct access to the AsyncLocalStorage instance.
 */
export const getCurrentDBAdapterAsyncLocalStorage = async () => {
	return ensureAsyncStorage();
};

export const getCurrentAdapter = async (
	fallback: DBTransactionAdapter,
): Promise<DBTransactionAdapter> => {
	return ensureAsyncStorage()
		.then((als) => {
			return als.getStore() || fallback;
		})
		.catch(() => {
			return fallback;
		});
};

export const runWithAdapter = async <R>(
	adapter: DBAdapter,
	fn: () => R,
): Promise<R> => {
	let called = true;
	return ensureAsyncStorage()
		.then((als) => {
			called = true;
			return als.run(adapter, fn);
		})
		.catch((err) => {
			if (!called) {
				return fn();
			}
			throw err;
		});
};

export const runWithTransaction = async <R>(
	adapter: DBAdapter,
	fn: () => R,
): Promise<R> => {
	let called = true;
	return ensureAsyncStorage()
		.then((als) => {
			called = true;
			return adapter.transaction(async (trx) => {
				return als.run(trx, fn);
			});
		})
		.catch((err) => {
			if (!called) {
				return fn();
			}
			throw err;
		});
};
