// @vitest-environment happy-dom

import { atom, cleanStores, onMount } from "nanostores";
import type { Accessor } from "solid-js";
import { createEffect, createRoot } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { useStore } from "./solid-store";

describe("useStore with Solid 1", () => {
	it("tracks nanostore updates and releases the subscription", () => {
		const store = atom(0);
		const cleanup = vi.fn();
		onMount(store, () => {
			store.set(1);
			return cleanup;
		});

		let value: Accessor<number> | undefined;
		let dispose: (() => void) | undefined;
		createRoot((rootDispose) => {
			dispose = rootDispose;
			value = useStore(store);
		});

		expect(value?.()).toBe(1);

		store.set(2);
		expect(value?.()).toBe(2);

		dispose?.();
		cleanStores(store);
		expect(cleanup).toHaveBeenCalledOnce();
	});

	it("reactively propagates nested object updates", () => {
		const store = atom({
			user: {
				name: "Ada",
			},
		});
		const observedNames: string[] = [];

		let dispose: (() => void) | undefined;
		createRoot((rootDispose) => {
			dispose = rootDispose;
			const value = useStore(store);
			createEffect(() => {
				observedNames.push(value().user.name);
			});
		});

		expect(observedNames).toEqual(["Ada"]);

		store.set({
			user: {
				name: "Grace",
			},
		});

		expect(observedNames).toEqual(["Ada", "Grace"]);

		dispose?.();
	});
});
