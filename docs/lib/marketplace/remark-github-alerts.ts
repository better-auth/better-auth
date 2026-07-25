import type {
	Blockquote,
	LinkReference,
	Paragraph,
	PhrasingContent,
	Root,
} from "mdast";
import { visit } from "unist-util-visit";

export type GithubAlertType =
	| "note"
	| "tip"
	| "important"
	| "warning"
	| "caution";

const ALERT_TYPE_RE = /^(NOTE|TIP|IMPORTANT|WARNING|CAUTION)$/i;

/**
 * In CommonMark, `[!NOTE]` may parse as a *link reference*. GitHub special-cases
 * this for alerts; we accept both link-reference and plain-text forms.
 */
function matchAlertMarker(paragraph: Paragraph): {
	type: GithubAlertType;
	/** Phrasing nodes that follow the marker (may be empty). */
	rest: PhrasingContent[];
} | null {
	const children = paragraph.children;
	if (children.length === 0) return null;

	const first = children[0];

	// Case 1: linkReference `[!NOTE]` (possibly followed by more phrasing)
	if (first?.type === "linkReference") {
		const ref = first as LinkReference;
		const label = (ref.label ?? ref.identifier ?? "").replace(/^!/, "");
		const inner = phrasingToText(ref.children).replace(/^!/, "");
		const typeText = label || inner;
		if (!ALERT_TYPE_RE.test(typeText)) return null;
		return {
			type: typeText.toLowerCase() as GithubAlertType,
			rest: trimLeadingBreaks(children.slice(1)),
		};
	}

	// Case 2: plain text starting with `[!NOTE]` (same paragraph may continue
	// after a newline / softbreak — common with `> [!NOTE]\n> body`)
	if (first?.type === "text") {
		const marker = first.value.match(
			/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i,
		);
		if (!marker?.[1]) return null;

		const type = marker[1].toLowerCase() as GithubAlertType;
		let remainder = first.value.slice(marker[0].length);
		// Drop the line break that often follows the marker line
		remainder = remainder.replace(/^[ \t]*\n?/, "");

		const rest: PhrasingContent[] = [];
		if (remainder) {
			rest.push({ type: "text", value: remainder });
		}
		rest.push(...children.slice(1));
		return { type, rest: trimLeadingBreaks(rest) };
	}

	return null;
}

function phrasingToText(nodes: PhrasingContent[]): string {
	let text = "";
	for (const node of nodes) {
		if (node.type === "text") {
			text += node.value;
		} else if (node.type === "inlineCode") {
			text += node.value;
		} else if (node.type === "break") {
			text += "\n";
		} else if ("children" in node && Array.isArray(node.children)) {
			text += phrasingToText(node.children as PhrasingContent[]);
		}
	}
	return text;
}

function trimLeadingBreaks(nodes: PhrasingContent[]): PhrasingContent[] {
	let i = 0;
	while (i < nodes.length) {
		const node = nodes[i];
		if (node?.type === "break") {
			i += 1;
			continue;
		}
		if (node?.type === "text") {
			const trimmed = node.value.replace(/^[ \t\n]+/, "");
			if (!trimmed) {
				i += 1;
				continue;
			}
			return [{ ...node, value: trimmed }, ...nodes.slice(i + 1)];
		}
		break;
	}
	return nodes.slice(i);
}

/**
 * Transform GitHub alert blockquotes (`> [!NOTE]`, etc.) into annotated
 * blockquotes that the marketplace renderer can style.
 *
 * @see https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts
 */
export function remarkGithubAlerts() {
	return (tree: Root) => {
		visit(tree, "blockquote", (node: Blockquote) => {
			const first = node.children[0];
			if (!first || first.type !== "paragraph") return;

			const matched = matchAlertMarker(first);
			if (!matched) return;

			const { type, rest } = matched;

			if (rest.length > 0) {
				first.children = rest;
			} else {
				// Drop the marker-only paragraph
				node.children.shift();
			}

			node.data = {
				...node.data,
				hName: "blockquote",
				hProperties: {
					...(typeof node.data?.hProperties === "object" &&
					node.data.hProperties !== null
						? node.data.hProperties
						: {}),
					className: ["markdown-alert", `markdown-alert-${type}`],
					dataAlert: type,
					"data-alert": type,
				},
			};
		});
	};
}
