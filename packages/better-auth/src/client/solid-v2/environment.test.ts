// @vitest-environment happy-dom

import { createMemo, createRoot, createSignal, DEV, flush } from "solid-js";
import { describe, expect, it } from "vitest";

/**
 * Guards the test setup every other Solid 2 test relies on: files under
 * `solid-v2/` resolve `solid-js@2` (not the package's Solid 1 dev dependency),
 * and happy-dom tests load the browser development build, which is reactive
 * and reports diagnostics, instead of the server build.
 *
 * @see https://docs.solidjs.com/guides/testing
 */
describe("solid-v2 test environment", () => {
	it("loads the Solid 2 browser development build", () => {
		expect(DEV).toBeDefined();
	});

	it("propagates signal writes after flush", () => {
		// Primitives are created under the root's owner; writes happen outside
		// it, as they would from an event handler.
		const { doubled, setCount, dispose } = createRoot((dispose) => {
			const [count, setCount] = createSignal(0);
			const doubled = createMemo(() => count() * 2);
			return { doubled, setCount, dispose };
		});
		expect(doubled()).toBe(0);
		setCount(2);
		flush();
		expect(doubled()).toBe(4);
		dispose();
	});
});
