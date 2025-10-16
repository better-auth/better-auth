import type { Store, StoreValue } from "nanostores";
import { createStore, reconcile } from "solid-js/store";
import type { Accessor } from "solid-js";
import { onCleanup, onMount } from "solid-js";

export interface UseStoreOptions {
	/**
	 * Skip updating state on first mount.
	 * Useful to prevent side effects like fetching on initial render.
	 */
	skipOnMount?: boolean;
}

/**
 * Subscribes to store changes and gets store’s value.
 *
 * @param store Store instance.
 * @returns Store value.
 */
export function useStore<
	SomeStore extends Store,
	Value extends StoreValue<SomeStore>,
>(store: SomeStore, options?: UseStoreOptions): Accessor<Value> {
	// Activate the store explicitly:
	// https://github.com/nanostores/solid/issues/19
	const unbindActivation = store.listen(() => {});

	const [state, setState] = createStore({
		value: store.get(),
	});

	let isMounted = false;

	const unsubscribe = store.subscribe((newValue) => {
		if (options?.skipOnMount && !isMounted) return;
		setState("value", reconcile(newValue));
	});

	onMount(() => {
		isMounted = true;
	});

	onCleanup(() => unsubscribe());

	// Remove temporary listener now that there is already a proper subscriber.
	unbindActivation();

	return () => state.value;
}
