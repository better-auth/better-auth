import type { Store, StoreValue } from "nanostores";
import { atom } from "nanostores";

const kAuthQuery = Symbol.for("better-auth:auth-query");

type AuthQueryStore<SomeStore extends Store> = SomeStore & {
	readonly [kAuthQuery]: true;
	readonly init: StoreValue<SomeStore>;
};

export function isAuthQueryStore<SomeStore extends Store>(
	store: SomeStore,
): store is AuthQueryStore<SomeStore> {
	return kAuthQuery in store && store[kAuthQuery] === true;
}

export function createAuthQueryAtom<T extends object>(initialValue: T) {
	const queryAtom = atom(initialValue);
	Object.defineProperty(queryAtom, kAuthQuery, {
		value: true,
	});
	return queryAtom;
}
