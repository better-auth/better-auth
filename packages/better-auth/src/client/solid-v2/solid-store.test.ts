// @vitest-environment happy-dom

import { atom, onMount } from "nanostores";
import { createRoot, flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { useStore } from "./solid-store";

/**
 * `useStore` bridges a nanostores store into Solid 2 through `from()`.
 *
 * @see https://docs.solidjs.com/guides/integrate-non-solid-code#feed-an-outside-source-into-the-graph
 */
describe("useStore", () => {
	it("reads the current value synchronously without a Loading boundary", () => {
		const $count = atom(1);
		const { value, dispose } = createRoot((dispose) => ({
			value: useStore($count),
			dispose,
		}));
		expect(value()).toBe(1);
		dispose();
	});

	it("updates when the atom changes", async () => {
		const $count = atom(1);
		const { value, dispose } = createRoot((dispose) => ({
			value: useStore($count),
			dispose,
		}));
		expect(value()).toBe(1);
		$count.set(2);
		// `from()` delivers a push to a waiting reader on the next microtask.
		await Promise.resolve();
		flush();
		expect(value()).toBe(2);
		dispose();
	});

	it("unsubscribes when the owner is disposed", () => {
		const $count = atom(1);
		const { value, dispose } = createRoot((dispose) => ({
			value: useStore($count),
			dispose,
		}));
		expect(value()).toBe(1);
		expect($count.lc).toBeGreaterThan(0);
		dispose();
		expect($count.lc).toBe(0);
	});

	it("activates the store's onMount", () => {
		const $count = atom(0);
		let mounted = false;
		onMount($count, () => {
			mounted = true;
		});
		const { value, dispose } = createRoot((dispose) => ({
			value: useStore($count),
			dispose,
		}));
		expect(value()).toBe(0);
		expect(mounted).toBe(true);
		dispose();
	});
});
