import type { AsyncLocalStorage } from "node:async_hooks";
import { getBuiltinAsyncLocalStorage } from "./builtin";

/**
 * Due to the lack of AsyncLocalStorage in some environments (like Convex),
 *
 * We assume serverless functions are short-lived and single-threaded, so we can use a simple polyfill.
 */
class AsyncLocalStoragePolyfill<T> {
	#stores: T[] = [];

	run(store: T, fn: () => unknown): unknown {
		this.#stores.push(store);
		// Runs can settle out of order, so remove this run's store, not the last one.
		const leave = () => {
			this.#stores.splice(this.#stores.lastIndexOf(store), 1);
		};
		try {
			const result = fn();
			if (result instanceof Promise) {
				return result.finally(leave);
			}
			leave();
			return result;
		} catch (error) {
			leave();
			throw error;
		}
	}

	getStore(): T | undefined {
		return this.#stores.at(-1);
	}
}

let cachedAsyncLocalStorageConstructor: typeof AsyncLocalStorage | undefined;

export async function getAsyncLocalStorage(): Promise<
	typeof AsyncLocalStorage
> {
	if (cachedAsyncLocalStorageConstructor) {
		return cachedAsyncLocalStorageConstructor;
	}
	if ("AsyncLocalStorage" in globalThis) {
		const constructor = (
			globalThis as typeof globalThis & {
				AsyncLocalStorage?: typeof AsyncLocalStorage | null;
			}
		).AsyncLocalStorage;
		if (typeof constructor !== "function") {
			throw new Error(
				`Invalid globalThis.AsyncLocalStorage: expected a function, received ${typeof constructor}.`,
			);
		}
		cachedAsyncLocalStorageConstructor ??= constructor;
		return cachedAsyncLocalStorageConstructor;
	}
	// The polyfill shares a store across overlapping requests, so prefer the builtin.
	// No import(): on some runtimes a missing builtin fails past any catch.
	const builtinConstructor = getBuiltinAsyncLocalStorage();
	if (builtinConstructor) {
		cachedAsyncLocalStorageConstructor ??= builtinConstructor;
		return cachedAsyncLocalStorageConstructor;
	}
	cachedAsyncLocalStorageConstructor ??=
		AsyncLocalStoragePolyfill as unknown as typeof AsyncLocalStorage;
	return cachedAsyncLocalStorageConstructor;
}
