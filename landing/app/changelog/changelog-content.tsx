"use client";

import Link from "next/link";
import { useState } from "react";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@/lib/utils";

interface ReleaseMessage {
	tag: string;
	title: string;
	content: string;
	date: string;
	url: string;
}

export function ChangelogContent({ messages }: { messages: ReleaseMessage[] }) {
	const [expandedCount, setExpandedCount] = useState(10);
	const visible = messages.slice(0, expandedCount);

	return (
		<>
			<div className="flex flex-col">
				{visible.map((release, i) => (
					<div
						key={release.tag}
						className="group border-b border-dashed border-foreground/[0.06] px-5 sm:px-6 lg:px-8 py-6"
					>
						{/* Release header */}
						<div className="flex items-baseline justify-between mb-4">
							<div className="flex items-center gap-3">
								<Link
									href={release.url}
									target="_blank"
									rel="noopener noreferrer"
									className="text-sm font-medium tracking-tight text-neutral-800 dark:text-neutral-200 hover:text-neutral-950 dark:hover:text-white transition-colors"
								>
									{release.title || release.tag}
								</Link>
								{release.title && release.title !== release.tag && (
									<span className="text-[10px] font-mono text-foreground/30 px-1.5 py-0.5 border border-foreground/[0.08] bg-foreground/[0.015]">
										{release.tag}
									</span>
								)}
							</div>
							<time className="text-[11px] font-mono text-neutral-400 dark:text-neutral-500 shrink-0 ml-4">
								{release.date}
							</time>
						</div>

						{/* Release body */}
						<div className="changelog-content">
							<Markdown
								rehypePlugins={[[rehypeHighlight]]}
								components={{
									h2: ({ children, ...props }) => (
										<h2
											className="text-base font-medium tracking-tight text-neutral-800 dark:text-neutral-200 mt-4 mb-2"
											{...props}
										>
											{children}
										</h2>
									),
									h3: ({ children, ...props }) => (
										<h3
											className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mt-3 mb-1.5 pb-1 border-b border-dashed border-foreground/[0.06]"
											{...props}
										>
											{children}
										</h3>
									),
									p: (props) => (
										<p
											className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed my-1"
											{...props}
										/>
									),
									ul: (props) => <ul className="space-y-0.5 my-1" {...props} />,
									li: (props) => (
										<li
											className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-foreground/50"
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
										<strong
											className="font-medium text-neutral-700 dark:text-neutral-300"
											{...props}
										/>
									),
									img: (props) => (
										<img
											className="inline-block w-5 h-5 rounded-full border border-foreground/10 opacity-70 mx-0.5 align-text-bottom"
											{...props}
											style={{ maxWidth: "100%" }}
											alt={props.alt || ""}
										/>
									),
									pre: (props) => (
										<pre
											className="text-[11px] bg-foreground/[0.03] border border-foreground/[0.06] p-3 my-2 overflow-x-auto"
											{...props}
										/>
									),
									code: ({ className, children, ...props }) => {
										const isInline = !className?.includes("language-");
										if (isInline) {
											return (
												<code
													className="text-[11px] font-mono bg-foreground/[0.05] px-1 py-0.5 text-neutral-600 dark:text-neutral-300"
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
								}}
							>
								{release.content}
							</Markdown>
						</div>
					</div>
				))}
			</div>

			{expandedCount < messages.length && (
				<div className="px-5 sm:px-6 lg:px-8 py-6">
					<button
						type="button"
						onClick={() =>
							setExpandedCount((c) => Math.min(c + 10, messages.length))
						}
						className="text-[12px] font-mono text-foreground/40 hover:text-foreground/70 uppercase tracking-wider transition-colors"
					>
						Load more releases ({messages.length - expandedCount} remaining)
					</button>
				</div>
			)}
		</>
	);
}
