import { afterEach, describe, expect, it, vi } from "vitest";
import { getRuntimeName, isNode, isWorkerd } from "./runtime";

describe("getRuntimeName", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	/**
	 * @see https://developers.cloudflare.com/workers/runtime-apis/web-standards/#navigatoruseragent
	 */
	it("detects Workers before the Node.js version that nodejs_compat reports", () => {
		vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
		vi.stubGlobal("process", { versions: { node: "22.19.0" } });

		expect(isNode()).toBe(true);
		expect(isWorkerd()).toBe(true);
		expect(getRuntimeName()).toBe("workerd");
	});

	it("detects Bun before the Node.js version it reports", () => {
		vi.stubGlobal("Bun", {});
		vi.stubGlobal("process", { versions: { node: "24.3.0" } });

		expect(getRuntimeName()).toBe("bun");
	});

	it("detects Deno before the Node.js version it reports", () => {
		vi.stubGlobal("Deno", {});
		vi.stubGlobal("process", { versions: { node: "24.3.0" } });

		expect(getRuntimeName()).toBe("deno");
	});

	it("returns undefined for a runtime it does not detect", () => {
		vi.stubGlobal("navigator", undefined);
		vi.stubGlobal("process", undefined);

		expect(getRuntimeName()).toBeUndefined();
	});
});
