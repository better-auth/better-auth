import type { Store, StoreValue } from "nanostores";
import { listenKeys } from "nanostores";
import { useCallback, useRef, useSyncExternalStore } from "octane";

// Octane keys hooks by a compiler-injected per-call-site Symbol, appended as
// the LAST argument of every `use*` call. A plain `.ts` module is still
// eligible for octane's surgical hook-slot pass; opting into manual slotting
// (this file does, via `octane.hookSlots.manual` in package.json) means
// `useStore` accepts the caller's slot as its trailing argument and derives
// stable child slots (one per internal hook call) via `subSlot`, which stays
// authoritative. Because the slot is per call site, `useStore(a)` and
// `useStore(b)` in one component stay independent, just like in React.
//
// Mirrors the binding strategy of `@octanejs/nanostores`, ported onto the
// better-auth client shape.
export function subSlot(
	slot: symbol | undefined,
	tag: string,
): symbol | undefined {
	return slot !== undefined
		? Symbol.for(`${slot.description ?? ""}:${tag}`)
		: undefined;
}

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
	deps?: unknown[];

	/**
	 * Will re-render components only on specific key changes.
	 */
	keys?: StoreKeys<SomeStore>[] | undefined;
}

let emit =
	<Value>(snapshotRef: { current: Value }, onChange: () => void) =>
	(value: Value): void => {
		if (snapshotRef.current === value) return;
		snapshotRef.current = value;
		onChange();
	};

// The `keys` option only makes sense for stores with `setKey` (maps), which is
// what StoreKeys encodes in the public types; the runtime store is still typed
// as the wider `Store` union here.
type StoreWithKeys = Parameters<typeof listenKeys>[0];

/**
 * Subscribe to store changes and get store's value.
 *
 * Octane binding for nanostores, returned by `createAuthClient` under the
 * `better-auth/octane` entrypoint.
 *
 * ```tsx
 * import { useStore } from "better-auth/octane";
 *
 * import { router } from "../store/router";
 *
 * export function Layout() {
 *   let page = useStore(router);
 *   if (page.route === "home") {
 *     <HomePage />;
 *   } else {
 *     <Error404 />;
 *   }
 * }
 * ```
 *
 * @param store Store instance.
 * @param options Subscription options (keys filtering, deps).
 * @param slot Compiler-injected call-site slot — never pass it by hand.
 * @returns Store value.
 */
export function useStore<SomeStore extends Store>(
	store: SomeStore,
	options: UseStoreOptions<SomeStore> = {},
	// The octane compiler appends a per-call-site Symbol slot as the LAST
	// argument of every `use*` call. Declaring `slot` as an explicit trailing
	// parameter captures it for the options-bearing case
	// (`useStore(store, opts, sym)`); the `typeof options === "symbol"`
	// reassignment below captures it for the no-options case
	// (`useStore(store, sym)`), where the compiler slot lands in `options`.
	// Without this parameter the option-bearing call's trailing Symbol would be
	// silently dropped, collapsing `useRef`/`useCallback`/`useSyncExternalStore`
	// onto one shared hook-cell.
	slot?: symbol,
): StoreValue<SomeStore> {
	if (typeof options === "symbol") {
		slot = options;
		options = {} as UseStoreOptions<SomeStore>;
	}

	const { keys, deps = [store, keys] } = options;

	const snapshotRef = useRef<StoreValue<SomeStore>>(
		store.get(),
		subSlot(slot, "ref"),
	);
	snapshotRef.current = store.get();

	const subscribe = useCallback(
		(onChange: () => void) => {
			emit(snapshotRef, onChange)(store.value);
			if (keys?.length) {
				return listenKeys(
					store as StoreWithKeys,
					keys,
					emit(snapshotRef, onChange),
				);
			}
			return store.listen(emit(snapshotRef, onChange));
		},
		// octane's `useCallback` expects `any[] | null` deps, mirroring React's
		// `DependencyList`; cast at the boundary to keep our public type `unknown[]`.
		deps as any[],
		subSlot(slot, "subscribe"),
	);

	const get = () => snapshotRef.current as StoreValue<SomeStore>;

	return useSyncExternalStore(
		subscribe,
		get,
		get,
		subSlot(slot, "external-store"),
	);
}
