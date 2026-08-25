import { describe, expect, it } from "vitest";
import type { VersionAvailability } from "./docs-versions";
import {
	docsVersions,
	getVersionFromPathname,
	getVersionTargetHref,
	resolveVersionFromSlug,
	versionedDocsHref,
} from "./docs-versions";

const latestVersion = docsVersions.find((version) => version.id === "latest")!;
const betaVersion = docsVersions.find((version) => version.id === "beta")!;
const version16 = docsVersions.find((version) => version.id === "1.6")!;

const availability: VersionAvailability = {
	"1.6": ["/docs/introduction", "/docs/plugins/scim"],
};

describe("documentation versions", () => {
	it("uses release branches for maintained historical documentation", () => {
		expect(version16.branch).toBe("v1.6.x");
	});

	it("resolves archived version slugs", () => {
		expect(resolveVersionFromSlug(["1.6", "plugins", "scim"])).toEqual({
			version: version16,
			relSlug: ["plugins", "scim"],
		});
	});

	it("detects archived versions from the pathname", () => {
		expect(getVersionFromPathname("/docs/1.6/plugins/scim")).toBe(version16);
	});

	it("builds archived documentation URLs", () => {
		expect(versionedDocsHref("/docs/plugins/scim", version16)).toBe(
			"/docs/1.6/plugins/scim",
		);
	});

	it("keeps the same page when it exists in the target version", () => {
		expect(
			getVersionTargetHref(
				"/docs/plugins/scim",
				latestVersion,
				version16,
				availability,
			),
		).toBe("/docs/1.6/plugins/scim");
	});

	it("falls back to the closest parent page", () => {
		expect(
			getVersionTargetHref(
				"/docs/beta/plugins/scim/reference",
				betaVersion,
				version16,
				availability,
			),
		).toBe("/docs/1.6/plugins/scim");
	});

	it("falls back to the introduction when no path segment matches", () => {
		expect(
			getVersionTargetHref(
				"/docs/unknown",
				latestVersion,
				version16,
				availability,
			),
		).toBe("/docs/1.6/introduction");
	});
});
