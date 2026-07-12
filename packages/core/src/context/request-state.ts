import type { AsyncLocalStorage } from "@better-auth/core/async_hooks";
import { getAsyncLocalStorage } from "@better-auth/core/async_hooks";
import { __getBetterAuthGlobal } from "./global";

export type RequestStateWeakMap = WeakMap<object, any>;

// Memoizes the in-flight AsyncLocalStorage initialization so concurrent
// first-callers share a single instance instead of each constructing one.
let asyncStorageInit: Promise<AsyncLocalStorage<RequestStateWeakMap>> | null =
	null;

const ensureAsyncStorage = async () => {
	const betterAuthGlobal = __getBetterAuthGlobal();
	const existing = betterAuthGlobal.context.requestStateAsyncStorage;
	if (existing) {
		return existing as AsyncLocalStorage<RequestStateWeakMap>;
	}
	// Without memoizing the init, several concurrent callers can each pass the
	// check above, each `await getAsyncLocalStorage()`, and each assign a fresh
	// instance — last write wins. `runWithRequestState().run()` then executes on
	// one instance while a nested `getCurrentRequestState()` reads the
	// overwritten one, throwing "No request state found". This shows up
	// intermittently on serverless cold start (e.g. Cloudflare Workers), where
	// the first requests hit before the lazy `node:async_hooks` import settles.
	// The idempotent `??=` keeps the global singleton stable even if multiple
	// BetterAuth copies (Dual Module Hazard) race here.
	if (!asyncStorageInit) {
		asyncStorageInit = getAsyncLocalStorage().then((AsyncLocalStorage) => {
			betterAuthGlobal.context.requestStateAsyncStorage ??=
				new AsyncLocalStorage<RequestStateWeakMap>();
			return betterAuthGlobal.context
				.requestStateAsyncStorage as AsyncLocalStorage<RequestStateWeakMap>;
		});
	}
	return asyncStorageInit;
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
