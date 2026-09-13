import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { FileObject, PopulateParams } from "next-validate-link";
import { printErrors, scanURLs, validateFiles } from "next-validate-link";
import { remark } from "remark";
import remarkMdx from "remark-mdx";
import { visit } from "unist-util-visit";
import { docsVersionSources } from "../lib/docs-version-sources.ts";
import { docsVersions, versionedDocsHref } from "../lib/docs-versions.ts";
import { scopeMarkdownLinks } from "../lib/markdown-links.ts";

const routeEntries: NonNullable<PopulateParams[string]> = [];
const files: FileObject[] = [];
const markdownParser = remark().use(remarkMdx);

interface MarkdownNode {
	type: string;
	value?: string;
	children?: MarkdownNode[];
}

function getNodeText(node: MarkdownNode): string {
	if (node.value !== undefined) return node.value;
	if (!node.children) return "";
	return node.children.map((child) => getNodeText(child)).join("");
}

function createHeadingSlugger() {
	const occurrences = new Map<string, number>();
	return (value: string) => {
		const base = value
			.trim()
			.toLowerCase()
			.replace(/[^\p{L}\p{N}\s_-]/gu, "")
			.replace(/\s+/g, "-");
		const count = occurrences.get(base) ?? 0;
		occurrences.set(base, count + 1);
		return count === 0 ? base : `${base}-${count}`;
	};
}

function getHeadingIds(content: string) {
	const slug = createHeadingSlugger();
	const headings: string[] = [];
	const tree = markdownParser.parse(content);
	visit(tree, "heading", (node) => {
		headings.push(slug(getNodeText(node)));
	});
	visit(tree, ["mdxJsxFlowElement", "mdxJsxTextElement"] as const, (node) => {
		if (!node.name || !/^h[1-6]$/.test(node.name)) return;
		for (const attribute of node.attributes) {
			if (
				attribute.type === "mdxJsxAttribute" &&
				attribute.name === "id" &&
				typeof attribute.value === "string"
			) {
				headings.push(attribute.value);
				break;
			}
		}
	});
	return headings;
}

function getMdxFiles(directory: string): string[] {
	const mdxFiles: string[] = [];
	for (const item of readdirSync(directory, { withFileTypes: true })) {
		const itemPath = join(directory, item.name);
		if (item.isDirectory()) mdxFiles.push(...getMdxFiles(itemPath));
		else if (item.name.endsWith(".mdx")) mdxFiles.push(itemPath);
	}
	return mdxFiles;
}

function normalizeTrailingSlashAnchors(content: string) {
	return content.replace(/(\/docs\/[^\s"'()<>{}\]]+?)\/#([\w-]+)/g, "$1#$2");
}

for (const version of docsVersions) {
	const contentDirectory = join(
		"content",
		docsVersionSources[version.id].contentDirectory,
	);
	const mdxFiles = getMdxFiles(contentDirectory);
	if (mdxFiles.length === 0) {
		throw new Error(
			`${contentDirectory}: no MDX files found. Run sync-versions first.`,
		);
	}
	for (const filePath of mdxFiles) {
		const segments = relative(contentDirectory, filePath)
			.replace(/\.mdx$/, "")
			.split(/[\\/]/);
		if (segments[0] === "examples") continue;
		if (segments.at(-1) === "index") segments.pop();

		const canonicalUrl = `/docs/${segments.join("/")}`.replace(/\/$/, "");
		const url = versionedDocsHref(canonicalUrl, version);
		const rawContent = readFileSync(filePath, "utf8");
		const versionedContent =
			version.id !== "latest"
				? scopeMarkdownLinks(rawContent, version)
				: rawContent;
		const content = normalizeTrailingSlashAnchors(versionedContent);

		routeEntries.push({
			value: {
				slug: version.id !== "latest" ? [version.id, ...segments] : segments,
			},
			hashes: getHeadingIds(rawContent),
		});
		files.push({ path: filePath, content, url });
	}
}

const scanned = await scanURLs({
	preset: "next",
	cwd: process.cwd(),
	populate: {
		"docs/[[...slug]]": routeEntries,
	},
});

printErrors(
	await validateFiles(files, {
		scanned,
		markdown: {
			components: {
				Card: { attributes: ["href"] },
				Link: { attributes: ["href"] },
			},
		},
		checkRelativePaths: "as-url",
		whitelist: (url) =>
			url === "/docs" ||
			url === "/dashboard" ||
			url === "/llms.txt" ||
			url.startsWith("chrome://"),
	}),
	true,
);

console.log(`[validate-links] ${files.length} documents passed`);
