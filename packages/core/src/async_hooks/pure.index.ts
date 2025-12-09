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

const AsyncLocalStoragePromise: Promise<typeof AsyncLocalStorage | null> =
	Promise.resolve().then(() => {
		if ("AsyncLocalStorage" in globalThis) {
			return (globalThis as any).AsyncLocalStorage;
		}
		return AsyncLocalStoragePolyfill;
	});

export async function getAsyncLocalStorage(): Promise<
	typeof AsyncLocalStorage
> {
	const mod = await AsyncLocalStoragePromise;
	if (mod === null) {
		throw new Error("getAsyncLocalStorage is only available in server code");
	} else {
		return mod;
	}
}
