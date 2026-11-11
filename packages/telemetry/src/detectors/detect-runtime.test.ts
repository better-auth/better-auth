import { afterEach, describe, expect, it, vi } from "vitest";
import { detectRuntime } from "./detect-runtime";

describe("detectRuntime", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	/**
	 * @see https://developers.cloudflare.com/workers/runtime-apis/nodejs/
	 */
	it("reports Workers with nodejs_compat as workerd, not node", () => {
		vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
		vi.stubGlobal("process", { versions: { node: "22.19.0" } });

		expect(detectRuntime()).toEqual({ name: "workerd", version: null });
	});

	it("reports an undetected runtime as edge", () => {
		vi.stubGlobal("navigator", undefined);
		vi.stubGlobal("process", undefined);

		expect(detectRuntime()).toEqual({ name: "edge", version: null });
	});
});
