import { describe, expect, it } from "vitest";
import { docsVersions } from "./docs-versions";
import { scopeMarkdownLinks } from "./markdown-links";

const version16 = docsVersions[1];

describe("versioned Markdown links", () => {
	it("scopes unversioned links without duplicating version prefixes", () => {
		expect(
			scopeMarkdownLinks(
				'[SCIM](/docs/plugins/scim) <Link href="/docs/1.6/introduction" />',
				version16,
			),
		).toBe(
			'[SCIM](/docs/1.6/plugins/scim) <Link href="/docs/1.6/introduction" />',
		);
	});

	it("scopes link definitions and MDX href attributes", () => {
		expect(
			scopeMarkdownLinks(
				'[SCIM][scim]\n\n[scim]: /docs/plugins/scim\n\n<Card href="/docs/introduction" />',
				version16,
			),
		).toBe(
			'[SCIM][scim]\n\n[scim]: /docs/1.6/plugins/scim\n\n<Card href="/docs/1.6/introduction" />',
		);
	});

	it("preserves links in code examples", () => {
		const content =
			'Use `[SCIM](/docs/plugins/scim)` as shown below.\n\n```mdx\n<Link href="/docs/introduction" />\n```';

		expect(scopeMarkdownLinks(content, version16)).toBe(content);
	});
});
