"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DynamicCodeBlock } from "@/components/ui/dynamic-code-block";
import { cn } from "@/lib/utils";

interface ReleaseMessage {
	tag: string;
	title: string;
	content: string;
	date: string;
	url: string;
	expandable: boolean;
}

function ReleaseBody({
	content,
	expandable,
}: {
	content: string;
	expandable: boolean;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [isExpanded, setIsExpanded] = useState(false);

	const handleToggle = () => {
		if (isExpanded) {
			setIsExpanded(false);
			const group = containerRef.current?.closest(".group");
			if (group) {
				const offset = group.getBoundingClientRect().top - 40;
				window.scrollBy({ top: offset, behavior: "smooth" });
			}
		} else {
			setIsExpanded(true);
		}
	};

	return (
		<div ref={containerRef}>
			<div className="relative">
				<div
					className={cn(
						"changelog-content max-w-3xl",
						expandable && !isExpanded && "max-h-[400px] overflow-y-hidden",
					)}
				>
					<MarkdownContent content={content} />
				</div>
				{expandable && !isExpanded && (
					<div className="h-20 absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none" />
				)}
			</div>
			{expandable && (
				<button
					type="button"
					onClick={handleToggle}
					className="inline-flex items-center gap-1.5 mt-12 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
				>
					<ChevronDown
						className={cn(
							"size-3.5 transition-transform duration-200",
							isExpanded && "rotate-180",
						)}
					/>
					{isExpanded ? "Collapse release" : "Expand release"}
				</button>
			)}
		</div>
	);
}

function MarkdownContent({ content }: { content: string }) {
	return (
		<Markdown
			remarkPlugins={[remarkGfm]}
			components={{
				h2: ({ children, ...props }) => (
					<h2
						className="text-2xl font-semibold tracking-tight text-neutral-800 dark:text-neutral-200 mt-6 mb-3 [&_code]:text-xl"
						{...props}
					>
						{children}
					</h2>
				),
				h3: ({ children, ...props }) => (
					<h3
						className="text-xl font-semibold text-neutral-700 dark:text-neutral-300 mt-5 mb-2 tracking-tight [&_code]:text-lg"
						{...props}
					>
						{children}
					</h3>
				),
				p: (props) => (
					<p
						className="text-sm text-muted-foreground leading-7 my-2"
						{...props}
					/>
				),
				ul: (props) => (
					<ul
						className="space-y-1.5 my-3 in-[ul]:ml-2 in-[ul]:mt-1.5 in-[ul]:mb-0"
						{...props}
					/>
				),
				li: (props) => (
					<li
						className="text-sm text-muted-foreground leading-relaxed pl-4 relative before:content-['-'] before:absolute before:left-0 before:text-foreground/50"
						{...props}
					/>
				),
				a: ({
					className,
					...props
				}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
					className?: string;
				}) => (
					<a
						target="_blank"
						rel="noopener noreferrer"
						className={cn(
							"font-medium text-neutral-600 dark:text-neutral-300 underline decoration-dashed underline-offset-4 hover:text-neutral-900 dark:hover:text-white transition-colors",
							className,
						)}
						{...props}
					/>
				),
				strong: (props) => (
					<strong className="font-medium text-foreground/90" {...props} />
				),
				blockquote: (props) => (
					<blockquote
						className="mt-4 border-l-2 border-foreground/15 pl-4 italic text-sm text-muted-foreground"
						{...props}
					/>
				),
				ol: (props) => (
					<ol
						className="list-decimal space-y-1.5 my-3 ml-6 text-sm text-muted-foreground"
						{...props}
					/>
				),
				hr: () => null,
				img: (props) => (
					<img
						className="inline-block w-5 h-5 rounded-full border opacity-80 mx-0.5 align-text-bottom"
						{...props}
						style={{ maxWidth: "100%" }}
						alt={props.alt || ""}
					/>
				),
				pre: ({ children }) => {
					const codeEl = children as React.ReactElement<{
						className?: string;
						children?: string;
					}>;
					const className = codeEl?.props?.className || "";
					const lang = className.replace(/language-/, "") || "text";
					const code =
						typeof codeEl?.props?.children === "string"
							? codeEl.props.children.trim()
							: "";
					return (
						<div className="my-4">
							<DynamicCodeBlock
								lang={lang}
								code={code}
								codeblock={{ className: "border rounded-md" }}
							/>
						</div>
					);
				},
				code: ({ className, children, ...props }) => {
					if (className?.includes("language-")) {
						return (
							<code className={className} {...props}>
								{children}
							</code>
						);
					}
					return (
						<code
							className="text-xs font-mono bg-muted px-1.5 py-0.5 text-neutral-600 dark:text-neutral-300 rounded-sm"
							{...props}
						>
							{children}
						</code>
					);
				},
				table: (props) => (
					<div className="my-4 overflow-x-auto">
						<table className="w-full text-sm border-collapse" {...props} />
					</div>
				),
				thead: (props) => <thead className="border-b" {...props} />,
				tbody: (props) => <tbody {...props} />,
				tr: (props) => (
					<tr
						className="border-b border-foreground/6 transition-colors hover:bg-muted/50"
						{...props}
					/>
				),
				th: (props) => (
					<th
						className="h-10 px-3 text-left align-middle font-bold text-muted-foreground text-xs"
						{...props}
					/>
				),
				td: (props) => (
					<td className="px-3 py-2.5 align-middle text-sm" {...props} />
				),
			}}
		>
			{content}
		</Markdown>
	);
}

export function ChangelogContent({ messages }: { messages: ReleaseMessage[] }) {
	return (
		<div className="flex flex-col">
			{messages.map((release) => (
				<div
					key={release.tag}
					className="group border-b border-dashed px-5 sm:px-6 lg:px-8 py-16 first:pt-8"
				>
					{/* Release header */}
					<div className="flex items-baseline mb-4">
						<div className="flex items-center gap-3">
							<Link
								href={release.url}
								target="_blank"
								rel="noopener noreferrer"
								className="text-2xl font-medium tracking-tight text-neutral-800 dark:text-neutral-200 hover:text-neutral-950 dark:hover:text-white transition-colors"
							>
								{release.title || release.tag}
							</Link>
							{release.title && release.title !== release.tag && (
								<span className="text-xs font-mono text-muted-foreground px-1.5 py-0.5 border bg-muted rounded-sm">
									{release.tag}
								</span>
							)}
						</div>
						<time className="text-xs font-mono tracking-tight text-muted-foreground shrink-0 ml-4">
							{release.date}
						</time>
					</div>

					{/* Release body */}
					<ReleaseBody
						content={release.content}
						expandable={release.expandable}
					/>
				</div>
			))}

			<div className="px-5 sm:px-6 lg:px-8 py-12">
				<Link
					href="https://github.com/better-auth/better-auth/releases"
					target="_blank"
					rel="noopener noreferrer"
					className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
				>
					View all releases on GitHub &rarr;
				</Link>
			</div>
		</div>
	);
}
