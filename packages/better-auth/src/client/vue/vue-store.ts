import type { Store, StoreValue } from "nanostores";
import {
	getCurrentInstance,
	getCurrentScope,
	onScopeDispose,
	readonly,
	shallowRef,
	type DeepReadonly,
	type ShallowRef,
	type UnwrapNestedRefs,
} from "vue";

export function registerStore(store: Store) {
	let instance = getCurrentInstance();
	if (instance && instance.proxy) {
		let vm = instance.proxy as any;
		let cache = "_nanostores" in vm ? vm._nanostores : (vm._nanostores = []);
		cache.push(store);
	}
}

export function useStore<
	SomeStore extends Store,
	Value extends StoreValue<SomeStore>,
>(store: SomeStore): DeepReadonly<UnwrapNestedRefs<ShallowRef<Value>>> {
	let state = shallowRef();

	let unsubscribe = store.subscribe((value) => {
		state.value = value;
	});

	getCurrentScope() && onScopeDispose(unsubscribe);

	if (process.env.NODE_ENV !== "production") {
		registerStore(store);
		return readonly(state);
	}
	return state;
}
