import { listenKeys } from "nanostores";
import { useCallback, useRef, useSyncExternalStore } from "react";
import type { Store, StoreValue } from "nanostores";
import type { DependencyList } from "react";

type StoreKeys<T> = T extends { setKey: (k: infer K, v: any) => unknown }
	? K
	: never;

let emit = (snapshotRef: any, onChange: any) => (value: any) => {
	snapshotRef.current = value;
	onChange();
};

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

export function useStore<SomeStore extends Store>(
	store: SomeStore,
	{ keys, deps = [store, keys] }: UseStoreOptions<SomeStore> = {},
): StoreValue<SomeStore> {
	let snapshotRef = useRef();
	snapshotRef.current = store.get();

	let subscribe = useCallback(
		(onChange: any) =>
			(keys?.length || 0) > 0
				? listenKeys(store as any, keys as any, emit(snapshotRef, onChange))
				: store.listen(emit(snapshotRef, onChange)),
		deps,
	);
	let get = () => snapshotRef.current;

	return useSyncExternalStore(subscribe, get, get) as StoreValue<SomeStore>;
}
