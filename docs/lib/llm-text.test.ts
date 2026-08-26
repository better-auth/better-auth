import { describe, expect, it } from "vitest";
import { docsVersions } from "./docs-versions";
import {
	getLLMsIndexTitle,
	getLLMsPageUrl,
	normalizeLLMsSlug,
} from "./llm-text";

describe("LLM routes", () => {
	it("uses the Better Auth product identity for latest docs", () => {
		expect(getLLMsIndexTitle()).toBe("Better Auth");
	});

	it("identifies archived documentation indexes", () => {
		const version = docsVersions.find((candidate) => candidate.id === "1.6");
		expect(version).toBeDefined();
		if (!version) return;

		expect(getLLMsIndexTitle(version)).toBe("Better Auth — v1.6");
	});

	it("maps documentation pages to Markdown endpoints", () => {
		expect(getLLMsPageUrl("/docs/introduction")).toBe(
			"/llms.txt/docs/introduction.md",
		);
		expect(getLLMsPageUrl("/docs/plugins/oauth?tab=server#usage")).toBe(
			"/llms.txt/docs/plugins/oauth.md?tab=server#usage",
		);
		expect(getLLMsPageUrl("/docs/foo(bar)/")).toBe(
			"/llms.txt/docs/foo(bar).md",
		);
		expect(getLLMsPageUrl("/llms.txt")).toBe("/llms.txt");
	});

	it("normalizes Markdown version indexes before routing", () => {
		expect(normalizeLLMsSlug(["1.6.md"])).toEqual(["1.6"]);
		expect(normalizeLLMsSlug(["docs", "1.6", "introduction.md"])).toEqual([
			"1.6",
			"introduction",
		]);
	});
});
