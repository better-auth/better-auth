import { describe, expect, it } from "vitest";
import { isPathWithinFolderIndex } from "./page-tree";

describe("isPathWithinFolderIndex", () => {
	it("matches a folder index and its hidden descendants", () => {
		expect(
			isPathWithinFolderIndex(
				"/docs/reference/errors",
				"/docs/reference/errors",
			),
		).toBe(true);
		expect(
			isPathWithinFolderIndex(
				"/docs/reference/errors",
				"/docs/reference/errors/unknown",
			),
		).toBe(true);
	});

	it("does not match sibling paths", () => {
		expect(
			isPathWithinFolderIndex(
				"/docs/reference/errors",
				"/docs/reference/resources",
			),
		).toBe(false);
	});
});
