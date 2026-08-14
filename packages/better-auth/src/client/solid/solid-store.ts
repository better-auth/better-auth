import type { Store, StoreValue } from "nanostores";
import type { Accessor } from "solid-js";
import { createSignal, onCleanup } from "solid-js";

/**
 * Subscribes to store changes and gets store’s value.
 *
 * @param store Store instance.
 * @returns Store value.
 */
export function useStore<
	SomeStore extends Store,
	Value extends StoreValue<SomeStore>,
>(store: SomeStore): Accessor<Value> {
	// Activate the store explicitly:
	// https://github.com/nanostores/solid/issues/19
	const unbindActivation = store.listen(() => {});

	// Solid 1 and 2 expose their store APIs from incompatible module paths, so
	// use their shared signal API. This intentionally invalidates the accessor
	// for every Nanostore update instead of reconciling nested properties.
	const [state, setState] = createSignal({
		value: store.get(),
	});

	const unsubscribe = store.listen((newValue) => {
		setState({ value: newValue });
	});

	onCleanup(() => unsubscribe());

	// Remove temporary listener now that there is already a proper subscriber.
	unbindActivation();

	return () => state().value;
}
