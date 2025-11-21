import type { EndpointContext, InputContext } from "better-call";
import type { AsyncLocalStorage } from "../async_hooks";
import { getAsyncLocalStorage } from "../async_hooks";
import type { AuthContext } from "../types";

export type AuthEndpointContext = Partial<
	InputContext<string, any> & EndpointContext<string, any>
> & {
	context: AuthContext;
};

let currentContextAsyncStorage: AsyncLocalStorage<AuthEndpointContext> | null =
	null;

const ensureAsyncStorage = async () => {
	if (!currentContextAsyncStorage) {
		const AsyncLocalStorage = await getAsyncLocalStorage();
		currentContextAsyncStorage = new AsyncLocalStorage();
	}
	return currentContextAsyncStorage;
};

/**
 * This is for internal use only. Most users should use `getCurrentAuthContext` instead.
 *
 * It is exposed for advanced use cases where you need direct access to the AsyncLocalStorage instance.
 */
export async function getCurrentAuthContextAsyncLocalStorage() {
	return ensureAsyncStorage();
}

export async function getCurrentAuthContext(): Promise<AuthEndpointContext> {
	const als = await ensureAsyncStorage();
	const context = als.getStore();
	if (!context) {
		throw new Error(
			"No auth context found. Please make sure you are calling this function within a `runWithEndpointContext` callback.",
		);
	}
	return context;
}

export async function runWithEndpointContext<T>(
	context: AuthEndpointContext,
	fn: () => T,
): Promise<T> {
	const als = await ensureAsyncStorage();
	return als.run(context, fn);
}
