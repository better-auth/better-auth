import type { AsyncLocalStorage } from "node:async_hooks";
import { getAsyncLocalStorage } from "@better-auth/core/async_hooks";
import type { DBAdapter, DBTransactionAdapter } from "../db/adapter";
import { __getBetterAuthGlobal } from "./global";

const ensureAsyncStorage = async () => {
	const betterAuthGlobal = __getBetterAuthGlobal();
	if (!betterAuthGlobal.context.adapterAsyncStorage) {
		const AsyncLocalStorage = await getAsyncLocalStorage();
		betterAuthGlobal.context.adapterAsyncStorage = new AsyncLocalStorage();
	}
	return betterAuthGlobal.context
		.adapterAsyncStorage as AsyncLocalStorage<DBTransactionAdapter>;
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
