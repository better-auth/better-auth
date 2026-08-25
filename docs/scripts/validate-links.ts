import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { FileObject, PopulateParams } from "next-validate-link";
import { printErrors, scanURLs, validateFiles } from "next-validate-link";
import { remark } from "remark";
import { visit } from "unist-util-visit";
import { docsVersions, versionedDocsHref } from "../lib/docs-versions.ts";

const routeEntries: NonNullable<PopulateParams[string]> = [];
const files: FileObject[] = [];

interface MarkdownNode {
	value?: unknown;
	children?: MarkdownNode[];
}

function getNodeText(node: MarkdownNode): string {
	if (typeof node.value === "string") return node.value;
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
	visit(remark().parse(content), "heading", (node) => {
		headings.push(slug(getNodeText(node as MarkdownNode)));
	});
	return headings;
}

function getMdxFiles(directory: string): string[] {
	const files: string[] = [];
	for (const item of readdirSync(directory, { withFileTypes: true })) {
		const itemPath = join(directory, item.name);
		if (item.isDirectory()) files.push(...getMdxFiles(itemPath));
		else if (item.name.endsWith(".mdx")) files.push(itemPath);
	}
	return files;
}

for (const version of docsVersions.filter(
	(version) => version.id === "latest",
)) {
	const contentDirectory = join("content", version.contentDirectory);
	for (const filePath of getMdxFiles(contentDirectory)) {
		const segments = relative(contentDirectory, filePath)
			.replace(/\.mdx$/, "")
			.split("/");
		if (segments[0] === "examples") continue;
		if (segments.at(-1) === "index") segments.pop();

		const canonicalUrl = `/docs/${segments.join("/")}`.replace(/\/$/, "");
		const url = versionedDocsHref(canonicalUrl, version);
		const rawContent = readFileSync(filePath, "utf8");
		const content =
			version.id !== "latest"
				? rawContent
						.replaceAll("](/docs/", `](/docs/${version.id}/`)
						.replace(/href=(["'])\/docs\//g, `href=$1/docs/${version.id}/`)
				: rawContent;

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
