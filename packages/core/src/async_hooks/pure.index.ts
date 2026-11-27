import type { AsyncLocalStorage } from "node:async_hooks";
import { getBuiltinAsyncLocalStorage } from "./builtin";

type Frame<T> = {
	store: T;
	parent?: Frame<T>;
	child?: Frame<T>;
};

/**
 * Due to the lack of AsyncLocalStorage in some environments (like Convex),
 *
 * We assume serverless functions are short-lived and single-threaded, so we can use a simple polyfill.
 */
class AsyncLocalStoragePolyfill<T> {
	#current: Frame<T> | undefined;

	run(store: T, fn: () => unknown): unknown {
		const frame: Frame<T> = { store, parent: this.#current };
		if (this.#current) {
			this.#current.child = frame;
		}
		this.#current = frame;
		// Runs can settle out of order, so unlink this run's frame wherever it is.
		const leave = () => {
			const { parent, child } = frame;
			if (parent) {
				parent.child = child;
			}
			if (child) {
				child.parent = parent;
				return;
			}
			this.#current = parent;
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
		return this.#current?.store;
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
