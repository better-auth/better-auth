import { describe, expect, it } from "vitest";
import { getSidebarMetadata, isPathWithinFolderIndex } from "./page-tree";

describe("getSidebarMetadata", () => {
	it("returns serializable sidebar metadata", () => {
		expect(
			getSidebarMetadata({
				sidebarBadge: "New",
				sidebarTitle: "Sessions",
			}),
		).toEqual({
			sidebarBadge: "New",
			sidebarTitle: "Sessions",
		});
	});

	it("ignores unsupported metadata values", () => {
		expect(
			getSidebarMetadata({
				sidebarBadge: true,
				sidebarTitle: 42,
			}),
		).toEqual({
			sidebarBadge: undefined,
			sidebarTitle: undefined,
		});
	});
});

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
