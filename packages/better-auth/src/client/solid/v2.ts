import type { BetterAuthClientOptions } from "@better-auth/core";
import type { ReadableAtom } from "nanostores";
import { createStore, onCleanup, reconcile } from "solid-js-v2";
import type { SolidAuthClient } from "./client";
import { createSolidAuthClient } from "./client";

export type * from "./index";

function useStore<Value>(store: ReadableAtom<Value>) {
	// Activate the store before reading it:
	// https://github.com/nanostores/solid/issues/19
	const releaseActivation = store.listen(() => {});
	const [state, setState] = createStore({ value: store.get() });
	onCleanup(store.listen((value) => setState(reconcile({ value }))));
	releaseActivation();
	return () => state.value;
}

/** Creates a Better Auth client for Solid 2. */
export function createAuthClient<Option extends BetterAuthClientOptions>(
	options?: Option,
): SolidAuthClient<Option> {
	return createSolidAuthClient(options, useStore);
}
