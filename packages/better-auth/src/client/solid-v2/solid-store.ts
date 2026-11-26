import type { Store, StoreValue } from "nanostores";
import type { Accessor } from "solid-js";
import { createMemo, from } from "solid-js";

/**
 * Subscribes the current Solid owner to a nanostores store and returns an
 * accessor for its value.
 *
 * `store.subscribe` emits the current value synchronously, so `from()` serves
 * it without a loading frame: the accessor is readable immediately and never
 * suspends. Subscribing also activates the store (its `onMount` runs), and
 * disposing the owner unsubscribes.
 *
 * Call it in a component body or another primitive so the subscription is
 * owned and released with it.
 *
 * @param store - The nanostores store to read.
 * @returns An accessor that tracks the store's value.
 */
export function useStore<SomeStore extends Store>(
	store: SomeStore,
): Accessor<StoreValue<SomeStore>> {
	return createMemo(() =>
		from<StoreValue<SomeStore>>((next) => store.subscribe(next)),
	);
}
