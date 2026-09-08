import type { Store, StoreValue } from "nanostores";
import { listenKeys } from "nanostores";
import type { DependencyList, Usable } from "react";
import { use, useCallback, useRef, useSyncExternalStore } from "react";
import ReactDOM from "react-dom";
import type { AuthQueryAtom, AuthQueryState } from "../query";
import { isAuthQueryAtom, kAuthQueryResource } from "../query";

type StoreKeys<T> = T extends { setKey: (k: infer K, v: any) => unknown }
	? K
	: never;

const queryStateCache = new WeakMap<object, object>();

// `browser` is currently only exported by React DOM Canary/Experimental.
// Keep stable React 19 usable until the API is available in a stable release.
const { browser } = ReactDOM as typeof ReactDOM & {
	browser?: (reason?: string) => Usable<void>;
};
const browserOnlyReason =
	"Better Auth query hooks require the browser. Use auth.api.getSession with request headers for server-side session reads.";

export type ReactStoreValue<SomeStore extends Store> =
	SomeStore extends AuthQueryAtom<infer Data>
		? Omit<AuthQueryState<Data>, "isPending">
		: StoreValue<SomeStore>;

export interface UseStoreOptions<SomeStore> {
	/**
	 * @default
	 * ```ts
	 * [store, options.keys]
	 * ```
	 */
	deps?: DependencyList | undefined;

	/**
	 * Will re-render components only on specific key changes.
	 */
	keys?: StoreKeys<SomeStore>[] | undefined;
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
	const snapshotRef = useRef<StoreValue<SomeStore>>(store.get());

	const { keys, deps = [store, keys] } = options;

	const subscribe = useCallback((onChange: () => void) => {
		const emitChange = (value: StoreValue<SomeStore>) => {
			if (snapshotRef.current === value) return;
			snapshotRef.current = value;
			onChange();
		};

		emitChange(store.value);
		if (keys?.length) {
			return listenKeys(store as any, keys, emitChange);
		}
		return store.listen(emitChange);
	}, deps);

	const get = () => snapshotRef.current as StoreValue<SomeStore>;

	return useSyncExternalStore(subscribe, get, get);
}

function omitPending<T>(
	state: AuthQueryState<T>,
): Omit<AuthQueryState<T>, "isPending"> {
	const cached = queryStateCache.get(state);
	if (cached) {
		return cached as Omit<AuthQueryState<T>, "isPending">;
	}
	const { isPending: _, ...result } = state;
	queryStateCache.set(state, result);
	return result;
}

export function useAuthStore<SomeStore extends Store>(
	store: SomeStore,
): ReactStoreValue<SomeStore> {
	if (isAuthQueryAtom(store)) {
		if (browser) {
			use(browser(browserOnlyReason));
		} else if (typeof window === "undefined") {
			// Stable React renders the nearest Suspense fallback on a server error
			// and retries the component in the browser.
			throw new Error(browserOnlyReason);
		}
	}

	const value = useStore(store);

	if (!isAuthQueryAtom(store)) {
		return value as ReactStoreValue<SomeStore>;
	}

	const state = value as AuthQueryState<unknown>;
	const resolvedState = store[kAuthQueryResource].shouldSuspend()
		? use(store[kAuthQueryResource].getPromise())
		: state;

	return omitPending(resolvedState) as ReactStoreValue<SomeStore>;
}
