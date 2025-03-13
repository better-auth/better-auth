// https://github.com/nanostores/react/blob/main/index.js

import { listenKeys } from "nanostores";
import { useCallback, useRef, useSyncExternalStore } from "react";
import type { Store, StoreValue } from "nanostores";
import type { DependencyList } from "react";

type StoreKeys<T> = T extends { setKey: (k: infer K, v: any) => unknown }
	? K
	: never;

export interface UseStoreOptions<SomeStore> {
	/**
	 * @default
	 * ```ts
	 * [store, options.keys]
	 * ```
	 */
	deps?: DependencyList;

	/**
	 * Will re-render components only on specific key changes.
	 */
	keys?: StoreKeys<SomeStore>[];
}

let emit = (snapshotRef: any, onChange: any) => (value: any) => {
	if (snapshotRef.current === value) return;
	snapshotRef.current = value;
	onChange();
};

export function useStore<SomeStore extends Store>(
	store: SomeStore,
	{ keys, deps = [store, keys] }: UseStoreOptions<SomeStore> = {},
): StoreValue<SomeStore> {
	let snapshotRef = useRef<StoreValue<SomeStore>>(store.get());
	snapshotRef.current = store.get();

	let subscribe = useCallback((onChange: () => void) => {
		emit(snapshotRef, onChange)(store.value);
		if (keys?.length) {
			return listenKeys(store as any, keys, emit(snapshotRef, onChange));
		}
		return store.listen(emit(snapshotRef, onChange));
	}, deps);

	let get = () => snapshotRef.current as StoreValue<SomeStore>;

	return useSyncExternalStore(subscribe, get, get);
}
