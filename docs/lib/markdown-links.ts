import { remark } from "remark";
import remarkMdx from "remark-mdx";
import { visit } from "unist-util-visit";
import type { DocsVersion } from "./docs-versions.ts";
import { scopeDocsHref } from "./docs-versions.ts";

type Replacement = {
	start: number;
	end: number;
	value: string;
};

const parser = remark().use(remarkMdx);

function addReplacement(
	replacements: Replacement[],
	content: string,
	start: number,
	end: number,
	href: string,
	scopedHref: string,
	searchFrom = 0,
) {
	const valueStart = content.slice(start, end).indexOf(href, searchFrom);
	if (valueStart === -1) return;

	replacements.push({
		start: start + valueStart,
		end: start + valueStart + href.length,
		value: scopedHref,
	});
}

export function scopeMarkdownLinks(
	content: string,
	version: DocsVersion,
): string {
	if (version.id === "latest") return content;

	const tree = parser.parse(content);
	const replacements: Replacement[] = [];

	visit(tree, ["link", "definition"] as const, (node) => {
		const scopedHref = scopeDocsHref(node.url, version);
		const start = node.position?.start.offset;
		const end = node.position?.end.offset;
		if (
			!scopedHref ||
			scopedHref === node.url ||
			start === undefined ||
			end === undefined
		) {
			return;
		}

		const rawNode = content.slice(start, end);
		const destinationStart =
			node.type === "link"
				? rawNode.lastIndexOf("](") + 2
				: rawNode.indexOf(":") + 1;
		addReplacement(
			replacements,
			content,
			start,
			end,
			node.url,
			scopedHref,
			destinationStart,
		);
	});

	visit(tree, ["mdxJsxFlowElement", "mdxJsxTextElement"] as const, (node) => {
		for (const attribute of node.attributes) {
			if (
				attribute.type !== "mdxJsxAttribute" ||
				attribute.name !== "href" ||
				typeof attribute.value !== "string"
			) {
				continue;
			}

			const scopedHref = scopeDocsHref(attribute.value, version);
			const start = attribute.position?.start.offset;
			const end = attribute.position?.end.offset;
			if (
				!scopedHref ||
				scopedHref === attribute.value ||
				start === undefined ||
				end === undefined
			) {
				continue;
			}

			addReplacement(
				replacements,
				content,
				start,
				end,
				attribute.value,
				scopedHref,
			);
		}
	});

	return replacements
		.sort((left, right) => right.start - left.start)
		.reduce(
			(result, replacement) =>
				`${result.slice(0, replacement.start)}${replacement.value}${result.slice(replacement.end)}`,
			content,
		);
}
