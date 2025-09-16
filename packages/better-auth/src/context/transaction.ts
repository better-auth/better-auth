import { AsyncLocalStorage } from "node:async_hooks";
import type { Adapter } from "../types";

/**
 * @internal
 */
const currentAdapterAsyncStorage = new AsyncLocalStorage<
	Omit<Adapter, "transaction">
>();

export const getCurrentAdapter = () => {
	const adapter = currentAdapterAsyncStorage.getStore();
	if (!adapter) {
		throw new Error(
			"No adapter found in the current context. Make sure to run this function within a `runWithAdapter` context.",
		);
	}
	return adapter;
};

export const runWithAdapter = <R>(
	adapter: Omit<Adapter, "transaction">,
	fn: () => R,
): R => {
	return currentAdapterAsyncStorage.run(adapter, fn);
};
