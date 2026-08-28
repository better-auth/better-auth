import type { PlaceholderData } from "fumadocs-core/mdx-plugins/remark-llms.runtime";
import { renderPlaceholder } from "fumadocs-core/mdx-plugins/remark-llms.runtime";
import type { Item, Node } from "fumadocs-core/page-tree";
import type { InferPageType } from "fumadocs-core/source";
import { llms } from "fumadocs-core/source";
import * as z from "zod";
import {
	apiMethodHttpMethods,
	generateApiMethodExamples,
	parseApiMethod,
} from "./api-method";
import type { DocsVersion } from "./docs-versions";
import { getVersionById } from "./docs-versions";
import { scopeMarkdownLinks } from "./markdown-links";
import type { source } from "./source";

const docsPathPattern = /^\/docs(?:\/|$)/;
const productionUrl = new URL("https://better-auth.com");
const llmsDescription =
	"The most comprehensive authentication framework for TypeScript";
const expressionValueSchema = z.object({ value: z.string() });
const expressionStringSchema = expressionValueSchema.transform(({ value }) =>
	z.string().parse(JSON.parse(value)),
);
const expressionBooleanSchema = expressionValueSchema.transform(({ value }) =>
	z.boolean().parse(JSON.parse(value)),
);
const stringAttributeSchema = z.union([z.string(), expressionStringSchema]);
const markerAttributeSchema = z
	.union([z.null(), z.boolean(), expressionBooleanSchema])
	.optional()
	.transform((value) => value === null || value === true);
const apiMethodAttributesSchema = z.object({
	path: stringAttributeSchema.pipe(z.string().startsWith("/")),
	method: stringAttributeSchema
		.pipe(z.enum(apiMethodHttpMethods))
		.optional()
		.default("GET"),
	isServerOnly: markerAttributeSchema,
	isClientOnly: markerAttributeSchema,
	isExternalOnly: markerAttributeSchema,
	noResult: markerAttributeSchema,
	requireSession: markerAttributeSchema,
	requireHeaders: markerAttributeSchema,
	requireBearerToken: markerAttributeSchema,
	headersComment: stringAttributeSchema.optional(),
	note: stringAttributeSchema.optional(),
	clientOnlyNote: stringAttributeSchema.optional(),
	serverOnlyNote: stringAttributeSchema.optional(),
	resultVariable: stringAttributeSchema.optional(),
	forceAsBody: markerAttributeSchema,
	forceAsParam: markerAttributeSchema,
	forceAsQuery: markerAttributeSchema,
});

function unwrapCodeBlock(markdown: string): string {
	const lines = markdown.trim().split("\n");
	if (lines[0]?.startsWith("```") && lines.at(-1)?.trim() === "```") {
		return lines.slice(1, -1).join("\n");
	}
	return markdown.trim();
}

function formatNote(note: string | undefined): string {
	return note ? `> **Note:** ${note}\n\n` : "";
}

export function renderApiMethodMarkdown({
	attributes,
	children,
}: PlaceholderData): string {
	const options = apiMethodAttributesSchema.parse(attributes);
	const sections = [`**Endpoint:** \`${options.method} ${options.path}\``];
	if (options.note) sections.push(formatNote(options.note).trimEnd());

	const definition = parseApiMethod(unwrapCodeBlock(children));
	if (!definition.functionName) {
		if (children.trim()) sections.push(children.trim());
		return sections.join("\n\n");
	}

	const examples = generateApiMethodExamples(definition, options);

	if (!options.isServerOnly && !options.isExternalOnly) {
		sections.push(
			`### Client Side\n\n${formatNote(options.clientOnlyNote)}\`\`\`ts\n${examples.client}\n\`\`\``,
		);
	}
	if (!options.isClientOnly) {
		sections.push(
			`### Server Side\n\n${formatNote(options.serverOnlyNote)}\`\`\`ts\n${examples.server}\n\`\`\``,
		);
	}
	sections.push(
		`### Type Definition\n\n\`\`\`ts\n${definition.typeDefinition}\n\`\`\``,
	);

	return sections.join("\n\n");
}

export async function getLLMText(
	docPage: InferPageType<typeof source>,
	version?: DocsVersion,
): Promise<string> {
	const mdContent = await docPage.data.getText("processed");
	const renderedContent = await renderPlaceholder(mdContent, {
		APIMethod: renderApiMethodMarkdown,
	});
	const processedContent =
		version && version.id !== "latest"
			? scopeMarkdownLinks(renderedContent, version)
			: renderedContent;

	const versionNote =
		version && version.id !== "latest"
			? `> You are reading Better Auth documentation for \`${version.label}\`. This is not the current stable release. APIs may differ from the latest stable version.\n\n`
			: "";

	return `${versionNote}# ${docPage.data.title} (${docPage.url})

${docPage.data.description || ""}

${processedContent}
`;
}

export function getLLMsIndexTitle(version?: DocsVersion): string {
	return version && version.id !== "latest"
		? `Better Auth Documentation — ${version.label}`
		: "Better Auth Documentation";
}

export function getDocsLLMsIndexUrl(
	version: DocsVersion,
	baseUrl?: URL,
): string {
	const path =
		version.id === "latest" ? "/docs/llms.txt" : `/docs/${version.id}/llms.txt`;
	return baseUrl ? new URL(path, baseUrl).toString() : path;
}

export function getRootLLMsIndex(versions: readonly DocsVersion[]): string {
	const versionLinks = versions
		.map(
			(version) =>
				`- [${version.label}](${getDocsLLMsIndexUrl(version, productionUrl)}): Documentation for the ${version.releaseLine}.x release line.`,
		)
		.join("\n");

	return `# Better Auth

> ${llmsDescription}

Use the documentation version that matches the Better Auth version installed in the project. Find a relevant page in an index, then fetch its \`.md\` URL for clean Markdown. Cite the canonical URL without the \`.md\` suffix.

## Documentation

- [Current documentation index](https://better-auth.com/docs/llms.txt): All pages for the latest stable release.
- [Documentation MCP server](https://mcp.better-auth.com/mcp): Search and retrieve Better Auth documentation from MCP-capable clients.

## Versions

${versionLinks}`;
}

export function getMarkdownPageUrl(url: string, baseUrl?: URL): string {
	if (!docsPathPattern.test(url)) return url;
	const parsed = new URL(url, productionUrl);
	const pathname = parsed.pathname.replace(/\/+$/, "");
	const markdownUrl = `${pathname}.md${parsed.search}${parsed.hash}`;
	return baseUrl ? new URL(markdownUrl, baseUrl).toString() : markdownUrl;
}

export function getLegacyMarkdownTarget(slug: string[]): string | null {
	if (slug.length === 1) {
		const version = getVersionById(slug[0]);
		if (version && version.id !== "latest") {
			return `/docs/${version.id}/llms.txt`;
		}
	}

	const lastSegment = slug.at(-1);
	if (
		!lastSegment ||
		(!lastSegment.endsWith(".md") && lastSegment.includes("."))
	) {
		return null;
	}

	const markdownSlug = lastSegment.endsWith(".md")
		? slug
		: [...slug.slice(0, -1), `${lastSegment}.md`];
	return markdownSlug[0] === "docs"
		? `/${markdownSlug.join("/")}`
		: `/docs/${markdownSlug.join("/")}`;
}

function withMarkdownPageUrl(node: Item): Item {
	return { ...node, url: getMarkdownPageUrl(node.url, productionUrl) };
}

function withMarkdownPageUrls(node: Node): Node {
	if (node.type === "page") return withMarkdownPageUrl(node);
	if (node.type === "separator") return node;
	return {
		...node,
		index: node.index ? withMarkdownPageUrl(node.index) : undefined,
		children: node.children.map(withMarkdownPageUrls),
	};
}

export function getLLMsIndex(
	loader: typeof source,
	version?: DocsVersion,
): string {
	const formatter = llms(loader);
	const pageTree = loader.getPageTree();
	const body = pageTree.children
		.map((node) => formatter.indexNode(withMarkdownPageUrls(node)))
		.join("\n");
	const sections = [
		`# ${getLLMsIndexTitle(version)}`,
		"",
		`> ${llmsDescription}`,
	];
	if (version) {
		sections.push(
			"",
			`This index covers the Better Auth ${version.releaseLine}.x documentation.`,
		);
	}
	sections.push("", "## Documentation", "", body);
	return sections.join("\n");
}

export function getLLMNotFound(path: string): string {
	return `# Documentation Page Not Found

The Markdown document \`${path}\` does not exist.

## Find the correct page

- [Current documentation index](https://better-auth.com/docs/llms.txt)
- [Documentation versions](https://better-auth.com/llms.txt)
- [Documentation MCP server](https://mcp.better-auth.com/mcp)`;
}
