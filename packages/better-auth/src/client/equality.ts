import type { Store, StoreValue } from "nanostores";
import { onSet } from "nanostores";

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

/**
 * Deep structural equality for JSON-serializable values.
 * Handles: primitives, null, arrays, and plain objects.
 * Short-circuits on referential equality at every recursion level.
 */
export function isJsonEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;

	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (!isJsonEqual(a[i], b[i])) return false;
		}
		return true;
	}

	if (isPlainObject(a) && isPlainObject(b)) {
		const keysA = Object.keys(a);
		const keysB = Object.keys(b);
		if (keysA.length !== keysB.length) return false;
		for (const key of keysA) {
			if (!(key in b) || !isJsonEqual(a[key], b[key])) return false;
		}
		return true;
	}

	return false;
}

/**
 * Attach an equality gate to a nanostores atom via `onSet`.
 * When `isEqual(currentValue, newValue)` returns true, the `set()` call
 * is aborted: no listeners fire, no framework re-renders occur.
 *
 * Returns the unsubscribe function from `onSet`.
 */
export function withEquality<S extends Store>(
	store: S,
	isEqual: (a: StoreValue<S>, b: StoreValue<S>) => boolean,
): () => void {
	return onSet(store, ({ newValue, abort }) => {
		if (isEqual(store.value, newValue)) {
			abort();
		}
	});
}
