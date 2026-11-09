import type { AsyncLocalStorage } from "node:async_hooks";

/**
 * Due to the lack of AsyncLocalStorage in some environments (like Convex),
 *
 * We assume serverless functions are short-lived and single-threaded, so we can use a simple polyfill.
 */
class AsyncLocalStoragePolyfill<T> {
	#current: T | undefined = undefined;

	run(store: T, fn: () => unknown): unknown {
		const prev = this.#current;
		this.#current = store;
		const result = fn();
		if (result instanceof Promise) {
			return result.finally(() => {
				this.#current = prev;
			});
		}
		this.#current = prev;
		return result;
	}

	getStore(): T | undefined {
		return this.#current;
	}
}

let cachedAsyncLocalStorageConstructor: typeof AsyncLocalStorage | undefined;

export async function getAsyncLocalStorage(): Promise<
	typeof AsyncLocalStorage
> {
	if (cachedAsyncLocalStorageConstructor) {
		return cachedAsyncLocalStorageConstructor;
	}
	const constructor =
		"AsyncLocalStorage" in globalThis
			? (
					globalThis as typeof globalThis & {
						AsyncLocalStorage?: typeof AsyncLocalStorage | null;
					}
				).AsyncLocalStorage
			: (AsyncLocalStoragePolyfill as unknown as typeof AsyncLocalStorage);
	if (typeof constructor !== "function") {
		throw new Error(
			`Invalid globalThis.AsyncLocalStorage: expected a function, received ${typeof constructor}.`,
		);
	}
	cachedAsyncLocalStorageConstructor ??= constructor;
	return cachedAsyncLocalStorageConstructor;
}
