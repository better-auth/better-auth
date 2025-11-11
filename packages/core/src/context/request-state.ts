import { type AsyncLocalStorage, getAsyncLocalStorage } from "../async_hooks";

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

	// A unique reference to state across requests. This is useful for debugging purposes.
	readonly ref: Readonly<object>;
}

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
			const value = store.get(ref);
			if (!value) {
				const initialValue = await initFn();
				store.set(ref, initialValue);
				return initialValue;
			}
			return value;
		},

		async set(value) {
			const store = await getCurrentRequestState();
			store.set(ref, value);
		},
	};
}
