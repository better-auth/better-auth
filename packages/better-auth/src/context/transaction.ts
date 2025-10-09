import {
	getAsyncLocalStorage,
	type AsyncLocalStorage,
} from "@better-auth/core/async_hooks";
import type {
	DBTransactionAdapter,
	DBAdapter,
} from "@better-auth/core/db/adapter";
import type { BetterAuthOptions } from "@better-auth/core";

let currentAdapterAsyncStorage: AsyncLocalStorage<
	DBTransactionAdapter<BetterAuthOptions>
> | null = null;

const ensureAsyncStorage = async () => {
	if (!currentAdapterAsyncStorage) {
		const AsyncLocalStorage = await getAsyncLocalStorage();
		currentAdapterAsyncStorage = new AsyncLocalStorage();
	}
	return currentAdapterAsyncStorage;
};

export const getCurrentAdapter = async (
	fallback: DBTransactionAdapter<BetterAuthOptions>,
): Promise<DBTransactionAdapter<BetterAuthOptions>> => {
	return ensureAsyncStorage()
		.then((als) => {
			return als.getStore() || fallback;
		})
		.catch(() => {
			return fallback;
		});
};

export const runWithAdapter = async <R>(
	adapter: DBAdapter<BetterAuthOptions>,
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
	adapter: DBAdapter<BetterAuthOptions>,
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
