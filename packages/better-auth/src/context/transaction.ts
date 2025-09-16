import { AsyncLocalStorage } from "node:async_hooks";
import type { Adapter } from "../types";

/**
 * Dynamically import AsyncLocalStorage to avoid issues in environments where it's not available.
 *
 * Right now, this is primarily for Cloudflare Workers and Vercel Edge Functions.
 */
let moduleName: string = "node:async_hooks";
const AsyncLocalStoragePromise: Promise<typeof AsyncLocalStorage> = import(
	moduleName
).then((mod) => mod.AsyncLocalStorage);

/**
 * @internal
 */
let currentAdapterAsyncStorage: AsyncLocalStorage<
	Omit<Adapter, "transaction">
> | null = null;

const ensureAsyncStorage = async () => {
	if (!currentAdapterAsyncStorage) {
		const AsyncLocalStorage = await AsyncLocalStoragePromise;
		currentAdapterAsyncStorage = new AsyncLocalStorage();
	}
	return currentAdapterAsyncStorage;
};

export const getCurrentAdapter = async (
	fallback: Omit<Adapter, "transaction">,
): Promise<Omit<Adapter, "transaction">> => {
	return ensureAsyncStorage()
		.then((als) => {
			return als.getStore() || fallback;
		})
		.catch(() => {
			return fallback;
		});
};

export const runWithAdapter = async <R>(
	adapter: Adapter,
	fn: () => R,
): Promise<R> => {
	return ensureAsyncStorage()
		.then((als) => {
			return als.run(adapter, fn);
		})
		.then(() => {
			return fn();
		});
};

export const runWithTransaction = async <R>(
	adapter: Adapter,
	fn: () => R,
): Promise<R> => {
	return ensureAsyncStorage()
		.then((als) => {
			return adapter.transaction(async (trx) => {
				return als.run(trx, fn);
			});
		})
		.then(() => {
			return fn();
		});
};
