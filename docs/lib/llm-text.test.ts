import { describe, expect, it } from "vitest";
import { docsVersions } from "./docs-versions";
import {
	getDocsLLMsIndexUrl,
	getLLMNotFound,
	getLLMsIndexTitle,
	getMarkdownPageUrl,
	getRootLLMsIndex,
} from "./llm-text";

describe("LLM routes", () => {
	it("uses the Better Auth product identity for latest docs", () => {
		expect(getLLMsIndexTitle()).toBe("Better Auth Documentation");
	});

	it("identifies archived documentation indexes", () => {
		const version = docsVersions.find((candidate) => candidate.id === "1.6");
		expect(version).toBeDefined();
		if (!version) return;

		expect(getLLMsIndexTitle(version)).toBe("Better Auth Documentation — v1.6");
		expect(getDocsLLMsIndexUrl(version)).toBe("/docs/1.6/llms.txt");
	});

	it("keeps the root index focused on discovery", () => {
		const content = getRootLLMsIndex(docsVersions);

		expect(content).toContain("https://better-auth.com/docs/llms.txt");
		expect(content).toContain("https://better-auth.com/docs/1.6/llms.txt");
		expect(content).toContain("https://mcp.better-auth.com/mcp");
		expect(content).not.toContain("/llms.txt/docs/");
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

	it("returns a useful Markdown not-found response", () => {
		const content = getLLMNotFound("/docs/missing.md");

		expect(content).toContain("# Documentation Page Not Found");
		expect(content).toContain("/docs/missing.md");
		expect(content).toContain("https://better-auth.com/docs/llms.txt");
	});
});
