import type { Root } from "fumadocs-core/page-tree";
import { describe, expect, it } from "vitest";
import { docsVersions } from "./docs-versions";
import {
	getLLMsIndexOptions,
	normalizeLLMsSlug,
	rewriteLLMsIndexLinks,
} from "./llm-text";

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

describe("LLM routes", () => {
	it("rewrites documentation links to Markdown endpoints", () => {
		expect(
			rewriteLLMsIndexLinks(
				"- [Introduction](/docs/introduction)\n- [LLMs.txt](/llms.txt)",
			),
		).toBe(
			"- [Introduction](/llms.txt/docs/introduction.md)\n- [LLMs.txt](/llms.txt)",
		);
	});

	it("normalizes Markdown version indexes before routing", () => {
		expect(normalizeLLMsSlug(["1.6.md"])).toEqual(["1.6"]);
		expect(normalizeLLMsSlug(["docs", "1.6", "introduction.md"])).toEqual([
			"1.6",
			"introduction",
		]);
	});
});
