"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { TOCItemType } from "fumadocs-core/toc";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

export interface StepperTOCItem extends TOCItemType {
	subheadings: TOCItemType[];
}

interface StepperTOCProps {
	items: StepperTOCItem[];
	children?: ReactNode;
}

export function StepperTOC({ items, children }: StepperTOCProps) {
	const headings = items;

	// Track which heading IDs are currently visible in the viewport
	const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
	// Track the last heading that scrolled past the top (the "active" one)
	const [activeId, setActiveId] = useState<string | null>(
		headings.length > 0 ? headings[0].url.slice(1) : null,
	);
	// Track the last subheading that was visible (sticky, like activeId)
	const [activeSubId, setActiveSubId] = useState<string | null>(null);
	const observerRef = useRef<IntersectionObserver | null>(null);

	useEffect(() => {
		// Collect all heading + subheading elements to observe
		const allIds = headings.flatMap((h) => [
			h.url.slice(1),
			...h.subheadings.map((s) => s.url.slice(1)),
		]);
		const elements = allIds
			.map((id) => document.getElementById(id))
			.filter(Boolean) as HTMLElement[];

		if (elements.length === 0) return;

		// Reset state when headings change
		setVisibleIds(new Set());
		setActiveId(null);

		observerRef.current = new IntersectionObserver(
			(entries) => {
				setVisibleIds((prev) => {
					const next = new Set(prev);
					for (const entry of entries) {
						if (entry.isIntersecting) {
							next.add(entry.target.id);
						} else {
							next.delete(entry.target.id);
						}
					}
					return next;
				});
			},
			{
				rootMargin: "0px 0px -60% 0px",
				threshold: [0, 1],
			},
		);

		for (const el of elements) {
			observerRef.current.observe(el);
		}

		return () => {
			observerRef.current?.disconnect();
		};
	}, [headings]);

	// Derive active heading from visible headings.
	// A parent heading is considered active if it or any of its subheadings are visible.
	// When none are visible, keep the previous activeId (sticky behavior).
	useEffect(() => {
		if (visibleIds.size === 0) return;
		for (let i = headings.length - 1; i >= 0; i--) {
			const id = headings[i].url.slice(1);
			const subIds = headings[i].subheadings.map((s) => s.url.slice(1));
			if (visibleIds.has(id) || subIds.some((sid) => visibleIds.has(sid))) {
				setActiveId((prev) => {
					if (prev !== id) setActiveSubId(null);
					return id;
				});
				return;
			}
		}
	}, [visibleIds, headings]);

	// Derive active subheading from visible subheadings of the current active heading.
	// Same sticky pattern: only update when a subheading is visible, otherwise keep the last one.
	const activeHeading = useMemo(
		() => headings.find((h) => h.url.slice(1) === activeId),
		[headings, activeId],
	);

	useEffect(() => {
		if (!activeHeading || activeHeading.subheadings.length === 0) {
			setActiveSubId(null);
			return;
		}
		const subs = activeHeading.subheadings;
		// Check if any subheading of the active parent is visible
		const hasVisibleSub = subs.some((s) => visibleIds.has(s.url.slice(1)));
		if (!hasVisibleSub) return; // keep sticky
		// Pick the last visible subheading in document order
		for (let i = subs.length - 1; i >= 0; i--) {
			if (visibleIds.has(subs[i].url.slice(1))) {
				setActiveSubId(subs[i].url.slice(1));
				return;
			}
		}
	}, [visibleIds, activeHeading]);

	const activeIndex = useMemo(() => {
		if (!activeId) return -1;
		return headings.findIndex((item) => item.url === `#${activeId}`);
	}, [activeId, headings]);

	const activeSubheadings = activeHeading?.subheadings ?? [];

	return (
		<div className="not-prose sticky top-[40px] z-20 bg-background/80 backdrop-blur-sm border-b border-foreground/5 py-3 mb-6">
			{/* Row 1: Primary headings */}
			<div className="flex items-center w-full">
				{headings.length > 0 && (
					<div className="flex items-center min-w-0 overflow-x-auto no-scrollbar">
						{headings.map((heading, i) => {
							const isActive = i === activeIndex;
							const isVisible = visibleIds.has(heading.url.slice(1));

							return (
								<div key={heading.url} className="flex items-center shrink-0">
									<a
										href={heading.url}
										className="flex items-center gap-1.5 cursor-pointer group no-underline"
									>
										<span
											className={`
                        shrink-0 size-[6px] border transition-all duration-300
                        ${
													isActive
														? "bg-foreground border-foreground scale-125"
														: isVisible
															? "bg-foreground/50 border-foreground/50"
															: "bg-transparent border-foreground/30 group-hover:border-foreground/50"
												}
                      `}
										/>
										<span
											className={`
                        text-[11px] uppercase tracking-wider whitespace-nowrap transition-colors duration-200
                        ${
													isActive
														? "text-foreground"
														: isVisible
? "text-foreground/60"
														: "text-foreground/40 group-hover:text-foreground/65"
												}
                      `}
										>
											{heading.title}
										</span>
									</a>

									{i < headings.length - 1 && (
										<span className="mx-2 text-foreground/30 text-[11px] select-none">
											/
										</span>
									)}
								</div>
							);
						})}
					</div>
				)}

				{/* Right-side actions */}
				{children && (
					<div className="flex items-center gap-3 shrink-0 ml-auto pl-2">
						{headings.length > 0 && (
							<span className="text-foreground/20 text-[11px] select-none">
								|
							</span>
						)}
						{children}
					</div>
				)}
			</div>

			{/* Row 2: Subheadings — slides in/out below the primary row */}
			<AnimatePresence>
				{activeSubheadings.length > 0 && (
					<motion.div
						key={activeId}
						className="overflow-hidden"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: "easeInOut" }}
					>
						<div className="flex items-center min-w-0 overflow-x-auto no-scrollbar pt-2">
							{activeSubheadings.map((sub) => {
								const isSubActive = activeSubId === sub.url.slice(1);
								return (
									<a
										key={sub.url}
										ref={(el) => {
											if (isSubActive && el) {
												el.scrollIntoView({
													behavior: "smooth",
													block: "nearest",
													inline: "center",
												});
											}
										}}
										href={sub.url}
										className="flex items-center gap-1 cursor-pointer group shrink-0 mr-3 no-underline"
									>
										{/* <span
											className={`shrink-0 size-[4px] rounded-full transition-colors duration-200 ${
												isSubActive
													? "bg-foreground"
													: "bg-foreground/30 group-hover:bg-foreground/50"
											}`}
										/> */}
										<span
											className={`text-[10px] uppercase tracking-wider whitespace-nowrap transition-colors duration-200 ${
												isSubActive
? "text-foreground"
											: "text-foreground/40 group-hover:text-foreground/65"
											}`}
										>
											{sub.title}
										</span>
									</a>
								);
							})}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
