import { describe, expect, it } from "vitest";
import {
	containsUnsupportedGeneratedMarkdown,
	formatUntrustedInlineMarkdown,
} from "../src/ai/generated-copy.ts";

describe("generated Markdown policy", () => {
	it.each([
		"Fixed session handling",
		"Fixed `@better-auth/sso` configuration",
		"Fixed ``Config<`value`>`` parsing",
		"Fixed comparisons where a < b",
		"Fixed issue #123 in version 1.7",
	])("allows inline release copy: %s", (value) => {
		expect(containsUnsupportedGeneratedMarkdown(value, "inline")).toBe(false);
	});

	it.each([
		"Fixed session handling\n\nInjected paragraph",
		"Read <https://example.com>",
		"Read [the guide][guide]\n\n[guide]: /docs",
		"Notify &#64;maintainers",
		"Notify @github/support",
		"Notify \\@maintainers",
		"Keep foo@bar unchanged",
		"Visit www.example.com",
		"Use <Config> directly",
		"Removed ~~deprecated behavior~~",
	])("rejects unsupported inline release copy: %s", (value) => {
		expect(containsUnsupportedGeneratedMarkdown(value, "inline")).toBe(true);
	});

	it("preserves supported copy and neutralizes unsupported copy", () => {
		expect(formatUntrustedInlineMarkdown("Fixed `Session` handling")).toBe(
			"Fixed `Session` handling",
		);
		expect(
			formatUntrustedInlineMarkdown(
				"See [the guide](https://example.com) and notify @maintainers",
			),
		).toBe("`See [the guide](https://example.com) and notify @maintainers`");
		expect(formatUntrustedInlineMarkdown("Fixed sessions\n\nInjected")).toBe(
			"Fixed sessions Injected",
		);
	});

	it("allows paragraphs, emphasis, and lists in changeset descriptions", () => {
		const value = [
			"Fix **session refreshes** for `@better-auth/sso`.",
			"",
			"- Preserve *existing* sessions.",
			"- Revalidate expired sessions.",
		].join("\n");

		expect(containsUnsupportedGeneratedMarkdown(value, "description")).toBe(
			false,
		);
	});

	it.each([
		"# Unexpected heading",
		"> Unexpected quote",
		"```ts\nalert('unexpected')\n```",
		"Read [the guide](/docs)",
		"1. Run the migration",
		"- [ ] Run the migration",
		"| Before | After |\n| --- | --- |\n| old | new |",
	])("rejects unsupported changeset Markdown: %s", (value) => {
		expect(containsUnsupportedGeneratedMarkdown(value, "description")).toBe(
			true,
		);
	});
});
