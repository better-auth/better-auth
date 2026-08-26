import type { Root } from "fumadocs-core/page-tree";
import { describe, expect, it } from "vitest";
import { docsVersions } from "./docs-versions";
import { getLLMsIndexOptions } from "./llm-text";

const root: Root = {
	type: "root",
	name: "Get Started",
	children: [],
};

describe("getLLMsIndexOptions", () => {
	it("uses the Better Auth product identity for latest docs", () => {
		const options = getLLMsIndexOptions();

		expect(options.renderName?.(root, {})).toBe("Better Auth");
		expect(options.renderDescription?.(root, {})).toBe(
			"The most comprehensive authentication framework for TypeScript",
		);
	});

	it("identifies archived documentation indexes", () => {
		const version = docsVersions.find((candidate) => candidate.id === "1.6");
		expect(version).toBeDefined();
		if (!version) return;

		const options = getLLMsIndexOptions(version);
		expect(options.renderName?.(root, {})).toBe("Better Auth — v1.6");
	});
});
