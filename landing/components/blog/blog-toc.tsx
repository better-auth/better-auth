"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

interface BlogTOCProps {
	items: { title: ReactNode; url: string; depth: number }[];
}

export function BlogTOC({ items }: BlogTOCProps) {
	const [activeId, setActiveId] = useState<string | null>(
		items.length > 0 ? items[0].url.slice(1) : null,
	);
	const observerRef = useRef<IntersectionObserver | null>(null);

	useEffect(() => {
		const ids = items.map((item) => item.url.slice(1));
		const elements = ids
			.map((id) => document.getElementById(id))
			.filter(Boolean) as HTMLElement[];

		if (elements.length === 0) return;

		observerRef.current = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						setActiveId(entry.target.id);
					}
				}
			},
			{
				rootMargin: "0px 0px -70% 0px",
				threshold: 0,
			},
		);

		for (const el of elements) {
			observerRef.current.observe(el);
		}

		return () => {
			observerRef.current?.disconnect();
		};
	}, [items]);

	const h2Items = useMemo(() => items.filter((i) => i.depth <= 2), [items]);

	if (h2Items.length === 0) return null;

	return (
		<nav className="flex flex-col gap-0.5">
			{h2Items.map((item) => {
				const id = item.url.slice(1);
				const isActive = activeId === id;

				return (
					<a
						key={item.url}
						href={item.url}
						className={`
							group flex items-center gap-2 py-1 text-[11px] tracking-wide no-underline transition-colors duration-200
							${
								isActive
									? "text-foreground/90"
									: "text-foreground/35 hover:text-foreground/60"
							}
						`}
					>
						<span
							className={`
								shrink-0 h-px transition-all duration-200
								${isActive ? "w-3 bg-foreground/70" : "w-1.5 bg-foreground/20 group-hover:bg-foreground/40"}
							`}
						/>
						<span className="truncate">{item.title}</span>
					</a>
				);
			})}
		</nav>
	);
}
