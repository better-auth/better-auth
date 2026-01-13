import type { AsyncLocalStorage } from "@better-auth/core/async_hooks";
import { getAsyncLocalStorage } from "@better-auth/core/async_hooks";
import type { EndpointContext, InputContext } from "better-call";
import type { AuthContext } from "../types";

export type AuthEndpointContext = Partial<
	InputContext<string, any> & EndpointContext<string, any>
> & {
	context: AuthContext;
};

const symbol = Symbol.for("better-auth:endpoint-context-async-storage");

let currentContextAsyncStorage: AsyncLocalStorage<AuthEndpointContext> | null =
	null;

const ensureAsyncStorage = async () => {
	if (
		!currentContextAsyncStorage ||
		(globalThis as any)[symbol] === undefined
	) {
		const AsyncLocalStorage = await getAsyncLocalStorage();
		currentContextAsyncStorage = new AsyncLocalStorage();
		(globalThis as any)[symbol] = currentContextAsyncStorage;
	}
	return (
		currentContextAsyncStorage ||
		((globalThis as any)[symbol] as AsyncLocalStorage<AuthEndpointContext>)
	);
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
