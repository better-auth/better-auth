import { describe, expect, it } from "vitest";
import { docsVersions } from "./docs-versions";
import {
	getDocsLLMsIndexUrl,
	getLegacyMarkdownTarget,
	getLLMNotFound,
	getLLMsIndexTitle,
	getMarkdownPageUrl,
	getRootLLMsIndex,
	renderApiMethodMarkdown,
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

	it("redirects legacy Markdown paths to canonical endpoints", () => {
		expect(getLegacyMarkdownTarget(["docs", "introduction"])).toBe(
			"/docs/introduction.md",
		);
		expect(getLegacyMarkdownTarget(["docs", "introduction.md"])).toBe(
			"/docs/introduction.md",
		);
		expect(getLegacyMarkdownTarget(["1.6", "plugins", "scim"])).toBe(
			"/docs/1.6/plugins/scim.md",
		);
		expect(getLegacyMarkdownTarget(["1.6"])).toBe("/docs/1.6/llms.txt");
		expect(getLegacyMarkdownTarget(["docs", "introduction.txt"])).toBeNull();
	});

	it("renders API method placeholders with all endpoint metadata", () => {
		const markdown = renderApiMethodMarkdown({
			name: "APIMethod",
			attributes: {
				path: "/admin/list-users",
				method: "GET",
				requireHeaders: null,
				headersComment: "Forward the request headers.",
				resultVariable: {
					value: '"users"',
				},
			},
			children: `\`\`\`ts
type listUsers = {
  limit?: number = 100
}
\`\`\``,
		});

		expect(markdown).toContain("**Endpoint:** `GET /admin/list-users`");
		expect(markdown).toContain("const { data: users, error } =");
		expect(markdown).toContain("const users = await auth.api.listUsers");
		expect(markdown).toContain("Forward the request headers.");
		expect(markdown).not.toContain("<APIMethod");
	});

	it("omits unavailable API method examples", () => {
		const markdown = renderApiMethodMarkdown({
			name: "APIMethod",
			attributes: {
				path: "/api-key/verify",
				method: "POST",
				isServerOnly: null,
			},
			children: `\`\`\`ts
type verifyApiKey = {
  key: string = "secret"
}
\`\`\``,
		});

		expect(markdown).not.toContain("### Client Side");
		expect(markdown).toContain("### Server Side");
	});

	it("renders PATCH API methods", () => {
		const markdown = renderApiMethodMarkdown({
			name: "APIMethod",
			attributes: {
				path: "/scim/v2/Users/:id",
				method: "PATCH",
			},
			children: `\`\`\`ts
type patchUser = {
  id: string = "user-id"
}
\`\`\``,
		});

		expect(markdown).toContain("**Endpoint:** `PATCH /scim/v2/Users/:id`");
	});

	it("supports explicit boolean marker attributes", () => {
		const children = `\`\`\`ts
type getSession = {
}
\`\`\``;
		const withSession = renderApiMethodMarkdown({
			name: "APIMethod",
			attributes: {
				path: "/get-session",
				requireSession: { value: "true" },
			},
			children,
		});
		const withoutSession = renderApiMethodMarkdown({
			name: "APIMethod",
			attributes: {
				path: "/get-session",
				requireSession: { value: "false" },
			},
			children,
		});

		expect(withSession).toContain("This endpoint requires session cookies.");
		expect(withoutSession).not.toContain(
			"This endpoint requires session cookies.",
		);
	});

	it("preserves endpoint metadata when the type definition is invalid", () => {
		const markdown = renderApiMethodMarkdown({
			name: "APIMethod",
			attributes: {
				path: "/admin/list-users",
				method: "GET",
				note: "Requires administrator access.",
			},
			children: `\`\`\`ts
interface ListUsers {}
\`\`\``,
		});

		expect(markdown).toContain("**Endpoint:** `GET /admin/list-users`");
		expect(markdown).toContain("> **Note:** Requires administrator access.");
		expect(markdown).toContain("interface ListUsers {}");
		expect(markdown).not.toContain("### Client Side");
	});

	it("returns a useful Markdown not-found response", () => {
		const content = getLLMNotFound("/docs/missing.md");

		expect(content).toContain("# Documentation Page Not Found");
		expect(content).toContain("/docs/missing.md");
		expect(content).toContain("https://better-auth.com/docs/llms.txt");
	});
});
