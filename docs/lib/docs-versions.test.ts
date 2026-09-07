import { describe, expect, it } from "vitest";
import { docsVersionSources } from "./docs-version-sources";
import type { VersionAvailability } from "./docs-versions";
import {
	docsVersions,
	getVersionFromPathname,
	getVersionTargetHref,
	resolveVersionFromSlug,
	versionedDocsHref,
} from "./docs-versions";

const [latestVersion, version16] = docsVersions;

const availability: VersionAvailability = {
	latest: [],
	"1.6": ["/docs/introduction", "/docs/plugins/scim"],
};

describe("documentation versions", () => {
	it("targets maintenance branches for documentation edits", () => {
		expect(docsVersionSources[version16.id].editBranch).toBe("v1.6.x");
	});

	it("pins historical documentation to an immutable revision", () => {
		expect(docsVersionSources[latestVersion.id].commitSha).toBeNull();
		expect(docsVersionSources[version16.id].commitSha).toMatch(
			/^[0-9a-f]{40}$/,
		);
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
		expect(versionedDocsHref("/docs", version16)).toBe(
			"/docs/1.6/introduction",
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
				"/docs/plugins/scim/reference",
				latestVersion,
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
