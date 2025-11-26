import type { AsyncLocalStorage } from "../async_hooks";
import { getAsyncLocalStorage } from "../async_hooks";

export type RequestStateWeakMap = WeakMap<object, any>;

let requestStateAsyncStorage: AsyncLocalStorage<RequestStateWeakMap> | null =
	null;

const ensureAsyncStorage = async () => {
	if (!requestStateAsyncStorage) {
		const AsyncLocalStorage = await getAsyncLocalStorage();
		requestStateAsyncStorage = new AsyncLocalStorage();
	}
	return requestStateAsyncStorage;
};

export async function getRequestStateAsyncLocalStorage() {
	return ensureAsyncStorage();
}

export async function hasRequestState() {
	const als = await ensureAsyncStorage();
	return als.getStore() !== undefined;
}

export async function getCurrentRequestState(): Promise<RequestStateWeakMap> {
	const als = await ensureAsyncStorage();
	const store = als.getStore();
	if (!store) {
		throw new Error(
			"No request state found. Please make sure you are calling this function within a `runWithRequestState` callback.",
		);
	}
	return store;
}

export async function runWithRequestState<T>(
	store: RequestStateWeakMap,
	fn: () => T,
): Promise<T> {
	const als = await ensureAsyncStorage();
	return als.run(store, fn);
}

export interface RequestState<T> {
	get(): Promise<T>;
	set(value: T): Promise<void>;

	// A unique reference used as a key to identify this state within the request's WeakMap. Useful for debugging purposes.
	readonly ref: Readonly<object>;
}

/**
 * Defines a request-scoped state with lazy initialization.
 *
 * @param initFn - A function that initializes the state. It is called the first time `get()` is invoked within each request context, and only once per context.
 * @returns A RequestState object with `get` and `set` methods, and a unique `ref` for debugging.
 *
 * @example
 * const userState = defineRequestState(() => ({ id: '', name: '' }));
 * // Later, within a request context:
 * const user = await userState.get();
 */
export function defineRequestState<T>(
	initFn: () => T | Promise<T>,
): RequestState<T>;
export function defineRequestState(
	initFn: () => any | Promise<any>,
): RequestState<any> {
	const ref = Object.freeze({});
	return {
		get ref(): Readonly<object> {
			return ref;
		},
		async get() {
			const store = await getCurrentRequestState();
			if (!store.has(ref)) {
				const initialValue = await initFn();
				store.set(ref, initialValue);
				return initialValue;
			}
			return store.get(ref);
		},

		async set(value) {
			const store = await getCurrentRequestState();
			store.set(ref, value);
		},
	};
}
