import { describe, expect, it } from "vitest";
import { setNoStore } from "./index";

describe("setNoStore", () => {
	it("applies the no-store cache header pair via setHeader", () => {
		const headers = new Headers();
		setNoStore({ setHeader: (key, value) => headers.set(key, value) });
		expect(headers.get("Cache-Control")).toBe("no-store");
		expect(headers.get("Pragma")).toBe("no-cache");
	});
});
