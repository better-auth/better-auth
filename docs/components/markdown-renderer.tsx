"use client";

import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import "highlight.js/styles/dark.css";
import { Pre } from "fumadocs-ui/components/codeblock";

interface MarkdownRendererProps {
	content: string;
	className?: string;
}

export function MarkdownRenderer({
	content,
	className = "",
}: MarkdownRendererProps) {
	return (
		<div className={`markdown-content px-2 ${className}`}>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[[rehypeHighlight]]}
				components={{
					pre: (props) => (
						<div className="my-4 max-w-full overflow-hidden">
							<Pre {...props} />
						</div>
					),

					code: ({ className, children, ...props }: any) => {
						const isInline = !className?.includes("language-");

						if (isInline) {
							return (
								<code
									className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono"
									{...props}
								>
									{children}
								</code>
							);
						}

						return (
							<code className={className} {...props}>
								{children}
							</code>
						);
					},

					h1: ({ children }) => (
						<h1 className="text-lg font-bold mt-6 mb-3 first:mt-0">
							{children}
						</h1>
					),
					h2: ({ children }) => (
						<h2 className="text-base font-semibold mt-5 mb-3">{children}</h2>
					),
					h3: ({ children }) => (
						<h3 className="text-sm font-semibold mt-4 mb-2">{children}</h3>
					),
					h4: ({ children }) => (
						<h4 className="text-sm font-medium mt-3 mb-2">{children}</h4>
					),
					h5: ({ children }) => (
						<h5 className="text-xs font-medium mt-3 mb-2">{children}</h5>
					),
					h6: ({ children }) => (
						<h6 className="text-xs font-medium mt-3 mb-2">{children}</h6>
					),

					p: ({ children }) => (
						<p className="text-sm leading-relaxed mb-3 last:mb-0">{children}</p>
					),

					a: ({ href, children }) => (
						<a
							href={href}
							target="_blank"
							rel="noopener noreferrer"
							className="text-primary underline hover:text-primary/80 text-sm transition-colors"
						>
							{children}
						</a>
					),
					blockquote: ({ children }) => (
						<blockquote className="border-l-4 border-muted-foreground/20 pl-4 my-4 text-sm italic">
							{children}
						</blockquote>
					),

					table: ({ children }) => (
						<div className="overflow-x-auto my-4 max-w-full">
							<table className="min-w-full text-sm border-collapse border border-border">
								{children}
							</table>
						</div>
					),
					th: ({ children }) => (
						<th className="border border-border px-2 py-1 bg-muted text-left font-medium">
							{children}
						</th>
					),
					td: ({ children }) => (
						<td className="border border-border px-2 py-1">{children}</td>
					),

					hr: () => <hr className="my-6 border-border" />,

					strong: ({ children }) => (
						<strong className="font-semibold">{children}</strong>
					),
					em: ({ children }) => <em className="italic">{children}</em>,
				}}
			>
				{content}
			</ReactMarkdown>
		</div>
	);
}
