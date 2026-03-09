import { describe, expect, it } from "vitest";
import { isBrowserFetchRequest } from "./fetch-metadata";

describe("isBrowserFetchRequest", () => {
	it("returns true for browser fetch requests", () => {
		expect(
			isBrowserFetchRequest(
				new Headers({
					"Sec-Fetch-Mode": "cors",
				}),
			),
		).toBe(true);
	});

	it("returns false for navigations", () => {
		expect(
			isBrowserFetchRequest(
				new Headers({
					"Sec-Fetch-Mode": "navigate",
				}),
			),
		).toBe(false);
	});

	it("returns false without fetch metadata", () => {
		expect(isBrowserFetchRequest()).toBe(false);
	});
});
