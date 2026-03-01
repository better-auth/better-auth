"use client";

import type {
	Folder as PageTreeFolder,
	Item as PageTreeItem,
	Separator as PageTreeSeparator,
} from "fumadocs-core/page-tree";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FC, ReactNode } from "react";
import { useState } from "react";
import { useCommandMenu } from "@/components/command-menu";

// ─── Item ───────────────────────────────────────────────────────────────────

export const CustomItem: FC<{ item: PageTreeItem }> = ({ item }) => {
	const pathname = usePathname();
	const active = pathname === item.url;

	return (
		<Link
			href={item.url}
			target={item.external ? "_blank" : undefined}
			rel={item.external ? "noopener noreferrer" : undefined}
			className={`
        flex items-center gap-2 px-3 py-1.5 text-sm font-mono transition-colors
        ${
					active
						? "text-foreground bg-foreground/[0.06] border-l-2 border-foreground font-medium"
						: "text-muted-foreground/80 hover:text-foreground hover:bg-foreground/[0.04] border-l-2 border-transparent"
				}
      `}
		>
			{item.icon && <span className="shrink-0 size-4">{item.icon}</span>}
			<span className="truncate">{item.name}</span>
		</Link>
	);
};

// ─── Folder ─────────────────────────────────────────────────────────────────

export const CustomFolder: FC<{
	item: PageTreeFolder;
	level: number;
	children: ReactNode;
}> = ({ item, children }) => {
	const pathname = usePathname();

	const containsActive = hasActiveChild(item, pathname);
	const [open, setOpen] = useState(item.defaultOpen ?? containsActive);

	return (
		<div className="flex flex-col">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex items-center justify-between px-3 py-1.5 text-sm font-mono font-medium text-muted-foreground/80 hover:text-foreground transition-colors cursor-pointer"
			>
				<span className="flex items-center gap-2">
					{item.icon && <span className="shrink-0 size-4">{item.icon}</span>}
					<span>{item.name}</span>
				</span>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`}
				>
					<path d="m9 18 6-6-6-6" />
				</svg>
			</button>

			{/* Index page link if folder has one */}
			{item.index && <CustomItem item={item.index} />}

			{/* Collapsible children with grid-template-rows trick */}
			<div
				className="grid transition-[grid-template-rows] duration-200"
				style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
			>
				<div className="overflow-hidden">
					<div className="pl-2">{children}</div>
				</div>
			</div>
		</div>
	);
};

// ─── Separator ──────────────────────────────────────────────────────────────

export const CustomSeparator: FC<{ item: PageTreeSeparator }> = ({ item }) => {
	return (
		<div className="mt-5 mb-1.5 px-3">
			{item.name ? (
				<span className="text-xs font-mono uppercase tracking-wider text-muted-foreground/80">
					{item.name}
				</span>
			) : (
				<div className="h-px bg-border" />
			)}
		</div>
	);
};

// ─── Search Button (sidebar banner) ─────────────────────────────────────────

export const SearchButton: FC = () => {
	const { setOpen } = useCommandMenu();

	return (
		<button
			type="button"
			onClick={() => setOpen(true)}
			className="flex items-center gap-2 w-full px-3 py-2 mb-2 text-sm font-mono text-muted-foreground/80 border border-border hover:text-foreground hover:bg-foreground/[0.04] transition-colors cursor-pointer"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="15"
				height="15"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				className="shrink-0"
			>
				<circle cx="11" cy="11" r="8" />
				<path d="m21 21-4.3-4.3" />
			</svg>
			<span className="flex-1 text-left">Search...</span>
			<kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono bg-foreground/[0.06] border border-border text-muted-foreground/70">
				<span className="text-xs">&#8984;</span>K
			</kbd>
		</button>
	);
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function hasActiveChild(folder: PageTreeFolder, pathname: string): boolean {
	if (folder.index?.url === pathname) return true;
	for (const child of folder.children) {
		if (child.type === "page" && child.url === pathname) return true;
		if (child.type === "folder" && hasActiveChild(child, pathname)) return true;
	}
	return false;
}
