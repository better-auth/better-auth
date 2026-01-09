import { DynamicCodeBlock } from "fumadocs-ui/components/dynamic-codeblock";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { ElementContent, Root, RootContent } from "hast";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { js_beautify } from "js-beautify";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { Children, Suspense, use, useDeferredValue, useMemo } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import { visit } from "unist-util-visit";

export interface Processor {
	process: (content: string) => Promise<ReactNode>;
}

export function rehypeWrapWords() {
	return (tree: Root) => {
		visit(tree, ["text", "element"], (node, index, parent) => {
			if (node.type === "element" && node.tagName === "pre") return "skip";
			if (node.type !== "text" || !parent || index === undefined) return;

			const words = node.value.split(/(?=\s)/);

			// Create new span nodes for each word and whitespace
			const newNodes: ElementContent[] = words.flatMap((word) => {
				if (word.length === 0) return [];

				return {
					type: "element",
					tagName: "span",
					properties: {
						class: "animate-fd-fade-in",
					},
					children: [{ type: "text", value: word }],
				};
			});

			Object.assign(node, {
				type: "element",
				tagName: "span",
				properties: {},
				children: newNodes,
			} satisfies RootContent);
			return "skip";
		});
	};
}

function createProcessor(): Processor {
	const processor = remark()
		.use(remarkGfm)
		.use(remarkRehype)
		.use(rehypeWrapWords);

	return {
		async process(content) {
			const nodes = processor.parse({ value: content });
			const hast = await processor.run(nodes);

			return toJsxRuntime(hast, {
				development: false,
				jsx,
				jsxs,
				Fragment,
				components: {
					...defaultMdxComponents,
					pre: Pre,
					img: undefined, // use JSX
				},
			});
		},
	};
}

/**
 * Fixes inconsistent indentation in the AI response.
 */
function reindent(code: string): string {
	const lines = code.split("\n");
	let level = 0;
	const result: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.length === 0) {
			result.push("");
			continue;
		}

		const withoutStrings = trimmed
			.replace(/"(?:[^"\\]|\\.)*"/g, '""')
			.replace(/'(?:[^'\\]|\\.)*'/g, "''")
			.replace(/`(?:[^`\\]|\\.)*`/g, "``")
			.replace(/\/\/.*$/g, "")
			.replace(/\/\*[\s\S]*?\*\//g, "");

		const opens = (withoutStrings.match(/[{\[\(]/g) || []).length;
		const closes = (withoutStrings.match(/[}\]\)]/g) || []).length;

		let currentLineLevel = level;
		if (withoutStrings.match(/^[}\]\)]/)) {
			currentLineLevel = Math.max(0, level - 1);
		}

		result.push("\t".repeat(currentLineLevel) + trimmed);
		level = Math.max(0, level + opens - closes);
	}

	return result.join("\n");
}

function CodeBlock({
	content,
	className,
}: {
	content: string;
	className?: string;
}) {
	const lang =
		className
			?.split(" ")
			.find((v) => v.startsWith("language-"))
			?.slice("language-".length) ?? "text";

	const displayLang = lang === "mdx" ? "md" : lang;

	const formattedCode = useMemo(() => {
		if (
			["ts", "tsx", "typescript", "js", "javascript", "json"].includes(
				displayLang,
			)
		) {
			return js_beautify(content, {
				indent_size: 2,
				indent_with_tabs: true,
				brace_style: "preserve-inline",
			}).trim();
		}
		return reindent(content.trimEnd());
	}, [content, displayLang]);

	return (
		<div style={{ tabSize: 2 }}>
			<DynamicCodeBlock lang={displayLang} code={formattedCode} />
		</div>
	);
}

function Pre(props: ComponentProps<"pre">) {
	const code = Children.only(props.children) as ReactElement;
	const codeProps = code.props as ComponentProps<"code">;
	const content = codeProps.children;

	if (typeof content !== "string") return null;

	return <CodeBlock content={content} className={codeProps.className} />;
}

const processor = createProcessor();

export function Markdown({ text }: { text: string }) {
	const deferredText = useDeferredValue(text);

	return (
		<Suspense fallback={<p className="invisible">{text}</p>}>
			<Renderer text={deferredText} />
		</Suspense>
	);
}

const cache = new Map<string, Promise<ReactNode>>();

function Renderer({ text }: { text: string }) {
	const result = cache.get(text) ?? processor.process(text);
	cache.set(text, result);

	return use(result);
}
