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
): StoreValue<SomeStore> {
	// The octane compiler appends a per-call-site Symbol slot as the LAST
	// argument of every `use*` call, so a call that omits `options` reaches us
	// as `useStore(store, sym)`. With `options` declared before `slot`, the
	// slot lands in `options`; a Symbol is truthy, so the default `= {}` would
	// keep it and `slot` would stay `undefined`, collapsing `useRef` and
	// `useCallback` onto one hook slot. Strip the compiler slot before
	// destructuring — a Symbol is never a valid `UseStoreOptions` value.
	let slot: symbol | undefined;
	if (typeof options === "symbol") {
		slot = options;
		options = {} as UseStoreOptions<SomeStore>;
	}

	const { keys, deps = [store, keys] } = options;

	const snapshotRef = useRef<StoreValue<SomeStore>>(
		store.get(),
		subSlot(slot as symbol | undefined, "ref"),
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
		subSlot(slot as symbol | undefined, "subscribe"),
	);

	const get = () => snapshotRef.current as StoreValue<SomeStore>;

	return useSyncExternalStore(
		subscribe,
		get,
		get,
		subSlot(slot as symbol | undefined, "external-store"),
	);
}
