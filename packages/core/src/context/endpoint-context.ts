import { type AsyncLocalStorage, getAsyncLocalStorage } from "../async_hooks";
import type { GenericEndpointContext } from "../types";

let currentContextAsyncStorage: AsyncLocalStorage<GenericEndpointContext> | null =
	null;

const ensureAsyncStorage = async () => {
	if (!currentContextAsyncStorage) {
		const AsyncLocalStorage = await getAsyncLocalStorage();
		currentContextAsyncStorage = new AsyncLocalStorage();
	}
	return currentContextAsyncStorage;
};

export async function getEndpointContext(): Promise<GenericEndpointContext> {
	const als = await ensureAsyncStorage();
	const context = als.getStore();
	if (!context) {
		throw new Error(
			"No auth context found. Please make sure you are calling this function within a `getEndpointContext` callback.",
		);
	}
	return context;
}

export async function runWithEndpointContext<T>(
	context: GenericEndpointContext,
	fn: () => T,
): Promise<T> {
	const als = await ensureAsyncStorage();
	return als.run(context, fn);
}
