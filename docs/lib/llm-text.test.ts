import { describe, expect, it } from "vitest";
import { docsVersions } from "./docs-versions";
import {
	getLLMsIndexTitle,
	getMarkdownPageUrl,
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
		expect(getMarkdownPageUrl("/docs/introduction")).toBe(
			"/docs/introduction.md",
		);
		expect(getMarkdownPageUrl("/docs/plugins/oauth?tab=server#usage")).toBe(
			"/docs/plugins/oauth.md?tab=server#usage",
		);
		expect(getMarkdownPageUrl("/docs/foo(bar)/")).toBe("/docs/foo(bar).md");
		expect(
			getMarkdownPageUrl(
				"/docs/introduction",
				new URL("https://better-auth.com"),
			),
		).toBe("https://better-auth.com/docs/introduction.md");
		expect(getMarkdownPageUrl("/llms.txt")).toBe("/llms.txt");
	});

	it("normalizes Markdown version indexes before routing", () => {
		expect(normalizeLLMsSlug(["1.6.md"])).toEqual(["1.6"]);
		expect(normalizeLLMsSlug(["docs", "introduction.md"])).toEqual([
			"introduction",
		]);
		expect(normalizeLLMsSlug(["docs", "1.6", "introduction.md"])).toEqual([
			"1.6",
			"introduction",
		]);
	});
});
