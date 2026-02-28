"use client";

import type { TOCItemType } from "fumadocs-core/toc";
import { useActiveAnchor } from "fumadocs-core/toc";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef } from "react";

interface BlogSidebarProps {
	toc: TOCItemType[];
}

export function BlogSidebar({ toc }: BlogSidebarProps) {
	const headings = useMemo(() => toc.filter((item) => item.depth <= 3), [toc]);

	const activeAnchor = useActiveAnchor();
	const navRef = useRef<HTMLElement>(null);

	const activeIndex = useMemo(() => {
		if (!activeAnchor) return -1;
		return headings.findIndex((item) => item.url === `#${activeAnchor}`);
	}, [activeAnchor, headings]);

	// Scroll the active TOC item into view
	useEffect(() => {
		const nav = navRef.current;
		if (!nav || activeIndex < 0) return;
		const activeEl = nav.querySelector<HTMLElement>(`[data-toc-active="true"]`);
		if (!activeEl) return;

		const navRect = nav.getBoundingClientRect();
		const elRect = activeEl.getBoundingClientRect();
		const isAbove = elRect.top < navRect.top;
		const isBelow = elRect.bottom > navRect.bottom;

		if (isAbove || isBelow) {
			activeEl.scrollIntoView({ block: "center", behavior: "smooth" });
		}
	}, [activeIndex]);

	const handleClick = useCallback((url: string) => {
		const id = url.slice(1);
		const el = document.getElementById(id);
		if (el) {
			el.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	}, []);

	return (
		<aside className="fixed left-0 top-[44px] bottom-0 w-[22vw] hidden lg:flex flex-col z-30 bg-background border-r border-foreground/5">
			{/* Back to blogs */}
			<Link
				href="/blog"
				className="flex items-center gap-2 px-4 lg:px-8 py-3 border-b border-foreground/5 text-[12px] uppercase tracking-wider text-foreground/45 hover:text-foreground/75 transition-colors"
			>
				<ArrowLeftIcon className="size-3.5" />
				<span>Back to blogs</span>
			</Link>

			{/* TOC */}
			{headings.length > 0 && (
				<nav
					ref={navRef}
					className="flex-1 overflow-y-auto overflow-x-hidden py-3 sidebar-scroll"
				>
					<div className="flex flex-col">
						{headings.map((heading, i) => {
							const isActive = i === activeIndex;
							const isPast = activeIndex >= 0 && i < activeIndex;
							const indent =
								heading.depth === 3 ? "pl-8 lg:pl-12" : "pl-4 lg:pl-8";

							return (
								<button
									key={heading.url}
									type="button"
									data-toc-active={isActive || undefined}
									onClick={() => handleClick(heading.url)}
									className={`relative text-left py-1.5 pr-4 text-[13px] transition-all duration-200 ${indent} ${
										isActive
											? "text-foreground bg-foreground/5"
											: isPast
												? "text-foreground/50"
												: "text-foreground/30 hover:text-foreground/60"
									}`}
								>
									{isActive && (
										<span className="absolute left-0 top-0 bottom-0 w-[2px] bg-foreground" />
									)}
									{heading.title}
								</button>
							);
						})}
					</div>
				</nav>
			)}
		</aside>
	);
}
