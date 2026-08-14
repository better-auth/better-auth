// @vitest-environment happy-dom

import { atom, cleanStores, onMount } from "nanostores";
import type { Accessor } from "solid-js-v2";
import { createEffect, createRoot, flush } from "solid-js-v2";
import { describe, expect, it, vi } from "vitest";
import { useStore } from "./solid-store";

describe("useStore with Solid 2", () => {
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
		flush();
		expect(value?.()).toBe(2);

		dispose?.();
		cleanStores(store);
		expect(cleanup).toHaveBeenCalledOnce();
	});

	it("preserves function-valued stores", () => {
		const initialValue = () => 1;
		const nextValue = () => 2;
		const store = atom(initialValue);

		let value: Accessor<typeof initialValue> | undefined;
		let dispose: (() => void) | undefined;
		createRoot((rootDispose) => {
			dispose = rootDispose;
			value = useStore(store);
		});

		expect(value?.()).toBe(initialValue);

		store.set(nextValue);
		flush();
		expect(value?.()).toBe(nextValue);

		dispose?.();
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
			createEffect(
				() => value().user.name,
				(name) => {
					observedNames.push(name);
				},
			);
		});

		flush();
		expect(observedNames).toEqual(["Ada"]);

		store.set({
			user: {
				name: "Grace",
			},
		});

		expect(observedNames).toEqual(["Ada"]);
		flush();
		expect(observedNames).toEqual(["Ada", "Grace"]);

		dispose?.();
	});
});
