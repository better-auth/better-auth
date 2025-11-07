import type { StandardSchemaV1 } from "@standard-schema/spec";
import z from "zod";
import { type AsyncLocalStorage, getAsyncLocalStorage } from "../async_hooks";

export type RequestStateWeakMap = WeakMap<StandardSchemaV1, any>;

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
	get<S>(): Promise<S & T>;
	set(value: T): Promise<void>;
}

export function defineRequestState<T>(
	schema?: StandardSchemaV1<T>,
): RequestState<T>;
export function defineRequestState<Schema extends StandardSchemaV1>(
	schema?: Schema,
): RequestState<StandardSchemaV1.InferInput<Schema>>;
export function defineRequestState(
	schema: StandardSchemaV1 = z.any(),
): RequestState<any> {
	return {
		async get() {
			const store = await getCurrentRequestState();
			return store.get(schema);
		},

		async set(value) {
			const store = await getCurrentRequestState();
			const parsedValue = await schema["~standard"].validate(value);
			if (parsedValue.issues) {
				throw new Error(`Invalid value: ${JSON.stringify(parsedValue.issues)}`);
			}
			store.set(schema, parsedValue.value);
		},
	};
}
