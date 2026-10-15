import type { Nodes } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfm } from "micromark-extension-gfm";

export type GeneratedMarkdownPolicy = "description" | "inline";

const inlineNodes = new Set(["root", "paragraph", "text", "inlineCode"]);
const descriptionNodes = new Set([
	...inlineNodes,
	"break",
	"emphasis",
	"list",
	"listItem",
	"strong",
]);

function containsUnsupportedNode(
	node: Nodes,
	allowedNodes: ReadonlySet<string>,
): boolean {
	if (!allowedNodes.has(node.type)) return true;
	if (node.type === "list" && node.ordered === true) return true;
	if (node.type === "listItem" && node.checked !== null) return true;
	if (node.type === "text" && node.value.includes("@")) return true;
	if (!("children" in node)) return false;
	return node.children.some((child) =>
		containsUnsupportedNode(child, allowedNodes),
	);
}

export function containsUnsupportedGeneratedMarkdown(
	value: string,
	policy: GeneratedMarkdownPolicy,
): boolean {
	if (policy === "inline" && (value.includes("\r") || value.includes("\n"))) {
		return true;
	}
	const allowedNodes =
		policy === "description" ? descriptionNodes : inlineNodes;
	const markdown = fromMarkdown(value, {
		extensions: [gfm()],
		mdastExtensions: [gfmFromMarkdown()],
	});
	return containsUnsupportedNode(markdown, allowedNodes);
}

export function formatUntrustedInlineMarkdown(value: string): string {
	const inline = value
		.replaceAll("\r\n", "\n")
		.replaceAll("\r", "\n")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.join(" ");
	if (!containsUnsupportedGeneratedMarkdown(inline, "inline")) return inline;
	return toMarkdown({ type: "inlineCode", value: inline }).trim();
}
