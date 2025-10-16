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

	/**
	 * Skip updating state on first mount.
	 * Useful to prevent side effects like fetching on initial render.
	 */
	skipOnMount?: boolean;
}

/**
 * Subscribe to store changes and get store's value.
 *
 * Can be used with store builder too.
 *
 * ```js
 * import { useStore } from 'nanostores/react'
 *
 * import { router } from '../store/router'
 *
 * export const Layout = () => {
 *   let page = useStore(router)
 *   if (page.route === 'home') {
 *     return <HomePage />
 *   } else {
 *     return <Error404 />
 *   }
 * }
 * ```
 *
 * @param store Store instance.
 * @returns Store value.
 */
export function useStore<SomeStore extends Store>(
	store: SomeStore,
	options: UseStoreOptions<SomeStore> = {},
): StoreValue<SomeStore> {
	const mounted = useRef(false);
	let snapshotRef = useRef<StoreValue<SomeStore>>(store.get());

	const { keys, deps = [store, keys] } = options;

	let subscribe = useCallback((onChange: () => void) => {
		const emitChange = (value: StoreValue<SomeStore>) => {
			if (options.skipOnMount && !mounted.current) return;
			if (snapshotRef.current === value) return;
			snapshotRef.current = value;
			onChange();
		};

		emitChange(store.value);
		mounted.current = true;
		if (keys?.length) {
			return listenKeys(store as any, keys, emitChange);
		}
		return store.listen(emitChange);
	}, deps);

	let get = () => snapshotRef.current as StoreValue<SomeStore>;

	return useSyncExternalStore(subscribe, get, get);
}
