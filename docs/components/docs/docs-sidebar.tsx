"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import type { Folder, Node, Root } from "fumadocs-core/page-tree";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { ChevronDownIcon, FileBoxIcon, FolderIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePageTree } from "@/app/docs/provider";
import { ThemeToggle } from "@/components/theme-toggle";
import {
	MobileVersionSwitcher,
	SidebarVersionSwitcher,
} from "@/components/version-switcher";
import {
	setMobileNavigationView,
	useMobileNavigationView,
} from "@/lib/mobile-navigation";
import { cn } from "@/lib/utils";

interface NavigationSection {
	id: string;
	name: ReactNode;
	icon?: ReactNode;
	children: Node[];
}

interface RootWithIcon extends Root {
	icon?: ReactNode;
}

function getNavigationSections(tree: Root): NavigationSection[] {
	const rootChildren = tree.children.filter((node) => node.type !== "folder");
	const sections: NavigationSection[] = [];

	if (rootChildren.length > 0) {
		sections.push({
			id: tree.$id ?? "root",
			name: tree.name,
			icon: (tree as RootWithIcon).icon,
			children: rootChildren,
		});
	}

	for (const node of tree.children) {
		if (node.type !== "folder") continue;
		sections.push({
			id: node.$id ?? `folder-${sections.length}`,
			name: node.name,
			icon: node.icon,
			children: node.children,
		});
	}

	return sections;
}

function nodeContainsPath(node: Node, pathname: string): boolean {
	if (node.type === "separator") return false;
	if (node.type === "page") return node.url === pathname;
	return (
		node.index?.url === pathname ||
		node.children.some((child) => nodeContainsPath(child, pathname))
	);
}

function getDefaultOpen(sections: NavigationSection[], pathname: string) {
	const index = sections.findIndex((section) =>
		section.children.some((node) => nodeContainsPath(node, pathname)),
	);
	return index === -1 ? 0 : index;
}

function useMobileDialog(active: boolean) {
	const dialogRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!active) return;
		const dialog = dialogRef.current;
		const previousFocus =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		const focusableSelector =
			'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
		const focusableElements =
			dialog?.querySelectorAll<HTMLElement>(focusableSelector);
		focusableElements?.[0]?.focus();

		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				setMobileNavigationView("closed");
				return;
			}
			if (event.key !== "Tab" || !focusableElements?.length) return;

			const first = focusableElements[0];
			const last = focusableElements[focusableElements.length - 1];
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}

		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			previousFocus?.focus();
		};
	}, [active]);

	return dialogRef;
}

export function DocsSidebar() {
	const pathname = usePathname() || "/docs";
	const tree = usePageTree();
	const mobileNavigationView = useMobileNavigationView();
	const mobileDialogRef = useMobileDialog(mobileNavigationView === "docs");
	const { setOpenSearch } = useSearchContext();
	const sections = useMemo(
		() => (tree ? getNavigationSections(tree) : []),
		[tree],
	);

	if (!tree) return null;

	return (
		<>
			<motion.aside
				initial={{ x: -24, opacity: 0 }}
				animate={{ x: 0, opacity: 1 }}
				transition={{ duration: 0.28, ease: "easeOut" }}
				className="fixed left-0 top-(--landing-topbar-height) bottom-0 w-[22vw] max-w-[300px] hidden lg:flex flex-col z-30 bg-background border-r border-foreground/5 transition-[width] duration-300 ease-out"
			>
				<SidebarVersionSwitcher />
				<SearchButton onClick={() => setOpenSearch(true)} />
				<SidebarNavigation sections={sections} pathname={pathname} />
				<SidebarFooter />
			</motion.aside>

			<AnimatePresence>
				{mobileNavigationView === "docs" ? (
					<motion.div
						ref={mobileDialogRef}
						role="dialog"
						aria-modal="true"
						aria-label="Documentation navigation"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
						className="lg:hidden fixed inset-0 z-40 w-full bg-background/95 backdrop-blur-sm"
					>
						<div className="flex h-full flex-col pt-(--landing-topbar-height)">
							<button
								type="button"
								onClick={() => setMobileNavigationView("site")}
								className="flex items-center gap-2 w-full px-5 py-2.5 text-foreground/65 dark:text-foreground/45 hover:text-foreground/70 transition-colors border-b border-foreground/6"
							>
								<svg width="12" height="12" viewBox="0 0 24 24">
									<path
										fill="currentColor"
										d="M3 18h18v-2H3zm0-5h18v-2H3zm0-7v2h18V6z"
									/>
								</svg>
								<span className="font-mono text-[10px] uppercase tracking-wider">
									Menu
								</span>
							</button>
							<div className="border-b border-foreground/6 py-1">
								<MobileVersionSwitcher />
							</div>
							<div className="flex-1 min-h-0 overflow-y-auto">
								<SidebarNavigation
									sections={sections}
									pathname={pathname}
									mobile
									onNavigate={() => setMobileNavigationView("closed")}
								/>
							</div>
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</>
	);
}

function SearchButton({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			className="group/search flex w-full items-center gap-2 px-4 py-[9px] border-b border-foreground/5 text-sm text-foreground/55 hover:text-foreground/80 hover:bg-foreground/3 transition-colors"
			onClick={onClick}
		>
			<svg
				className="size-4 shrink-0 text-foreground opacity-55 group-hover/search:opacity-80 transition-opacity"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<circle cx="11" cy="11" r="5.5" />
				<path d="m15 15l4 4" />
			</svg>
			<span className="truncate">Search</span>
			<kbd className="ml-auto inline-flex items-center gap-0.5 shrink-0 text-[10px] font-mono text-foreground/40 border border-foreground/10 rounded-md px-1.5 py-0.5">
				<span className="text-[11px]">&#8984;</span>K
			</kbd>
		</button>
	);
}

function SidebarNavigation({
	sections,
	pathname,
	mobile = false,
	onNavigate,
}: {
	sections: NavigationSection[];
	pathname: string;
	mobile?: boolean;
	onNavigate?: () => void;
}) {
	const [currentOpen, setCurrentOpen] = useState(() =>
		getDefaultOpen(sections, pathname),
	);
	const navigationRef = useRef<HTMLDivElement>(null);
	const navigationId = useId();

	useEffect(() => {
		setCurrentOpen(getDefaultOpen(sections, pathname));
	}, [pathname, sections]);

	useEffect(() => {
		if (mobile) return;
		const timer = setTimeout(() => {
			const activeElement = navigationRef.current?.querySelector<HTMLElement>(
				"[data-active='true']",
			);
			activeElement?.scrollIntoView({ block: "center", behavior: "smooth" });
		}, 380);
		return () => clearTimeout(timer);
	}, [currentOpen, mobile, pathname]);

	const content = (
		<MotionConfig transition={{ duration: 0.35, type: "spring", bounce: 0 }}>
			<div ref={navigationRef} className="flex flex-col">
				{sections.map((section, index) => {
					const panelId = `${navigationId}-section-${index}`;
					return (
						<div key={section.id}>
							<button
								type="button"
								aria-expanded={currentOpen === index}
								aria-controls={panelId}
								className={cn(
									"border-b border-foreground/6 w-full text-left flex gap-2 items-center transition-colors font-medium text-sm tracking-wider",
									mobile ? "px-5 py-3" : "px-4 py-2.5",
									currentOpen === index
										? "text-foreground bg-foreground/3"
										: "text-foreground/70 hover:text-foreground hover:bg-foreground/3",
								)}
								onClick={() =>
									setCurrentOpen((previous) =>
										previous === index ? -1 : index,
									)
								}
							>
								<span className="flex size-4.5 items-center justify-center [&>svg]:size-4.5">
									{section.icon ?? <FolderIcon />}
								</span>
								<span className="grow tracking-normal">{section.name}</span>
								<ChevronDownIcon
									className={cn(
										"h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
										currentOpen === index ? "rotate-180" : "",
									)}
								/>
							</button>
							<AnimatePresence initial={false}>
								{currentOpen === index ? (
									<motion.div
										id={panelId}
										initial={{ opacity: 0, height: 0 }}
										animate={{ opacity: 1, height: "auto" }}
										exit={{ opacity: 0, height: 0 }}
										className="relative overflow-hidden"
									>
										<NavigationNodes
											nodes={section.children}
											pathname={pathname}
											onNavigate={onNavigate}
										/>
									</motion.div>
								) : null}
							</AnimatePresence>
						</div>
					);
				})}
			</div>
		</MotionConfig>
	);

	if (mobile) return content;
	return (
		<nav
			className="flex-1 overflow-y-auto overflow-x-hidden pb-3 sidebar-scroll"
			style={{
				maskImage:
					"linear-gradient(to bottom, transparent, white 1rem, white calc(100% - 2rem), transparent 100%)",
			}}
		>
			{content}
		</nav>
	);
}

function NavigationNodes({
	nodes,
	pathname,
	onNavigate,
	nested = false,
}: {
	nodes: Node[];
	pathname: string;
	onNavigate?: () => void;
	nested?: boolean;
}) {
	return (
		<div
			className={cn(
				"text-sm pt-0 pb-1",
				nested &&
					"relative before:absolute before:left-10 before:top-0 before:bottom-0 before:w-px before:bg-foreground/20",
			)}
		>
			{nodes.map((node, index) => (
				<NavigationNode
					key={node.$id ?? getNodeKey(node, index)}
					node={node}
					pathname={pathname}
					onNavigate={onNavigate}
					nested={nested}
				/>
			))}
		</div>
	);
}

function getNodeKey(node: Node, index: number) {
	if (node.type === "page") return node.url;
	if (node.type === "folder") return node.$id ?? `folder-${index}`;
	return `separator-${index}`;
}

function NavigationNode({
	node,
	pathname,
	onNavigate,
	nested,
}: {
	node: Node;
	pathname: string;
	onNavigate?: () => void;
	nested: boolean;
}) {
	if (node.type === "separator") {
		return <NavigationSeparator>{node.name}</NavigationSeparator>;
	}

	if (node.type === "page") {
		return (
			<NavigationLink
				node={node}
				active={node.url === pathname}
				onNavigate={onNavigate}
				nested={nested}
			/>
		);
	}

	return (
		<NavigationFolder
			folder={node}
			pathname={pathname}
			onNavigate={onNavigate}
		/>
	);
}

function NavigationFolder({
	folder,
	pathname,
	onNavigate,
}: {
	folder: Folder;
	pathname: string;
	onNavigate?: () => void;
}) {
	const active = nodeContainsPath(folder, pathname);
	const index = folder.index;

	if (!index) {
		return (
			<>
				<NavigationSeparator>{folder.name}</NavigationSeparator>
				<NavigationNodes
					nodes={folder.children}
					pathname={pathname}
					onNavigate={onNavigate}
				/>
			</>
		);
	}
	const children = folder.children.filter((node) => node !== index);

	return (
		<div>
			<NavigationLink
				node={{
					...index,
					name: folder.name,
					icon: folder.icon ?? index.icon,
				}}
				active={active}
				onNavigate={onNavigate}
				nested={false}
			/>
			<AnimatePresence initial={false}>
				{active && children.length > 0 ? (
					<motion.div
						initial={{ opacity: 0, height: 0 }}
						animate={{ opacity: 1, height: "auto" }}
						exit={{ opacity: 0, height: 0 }}
						className="overflow-hidden"
					>
						<NavigationNodes
							nodes={children}
							pathname={pathname}
							onNavigate={onNavigate}
							nested
						/>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}

function NavigationSeparator({ children }: { children?: ReactNode }) {
	return (
		<div className="flex flex-row items-center gap-2 mx-4 lg:mx-7 my-2">
			<p className="text-[10px] text-foreground/45 uppercase tracking-wider">
				{children}
			</p>
			<div className="grow h-px bg-border" />
		</div>
	);
}

function NavigationLink({
	node,
	active,
	onNavigate,
	nested,
}: {
	node: Extract<Node, { type: "page" }>;
	active: boolean;
	onNavigate?: () => void;
	nested: boolean;
}) {
	const opensNewTab = node.external && node.url.startsWith("http");

	return (
		<Link
			href={node.url}
			target={opensNewTab ? "_blank" : undefined}
			rel={opensNewTab ? "noreferrer noopener" : undefined}
			onClick={onNavigate}
			data-active={active || undefined}
			className={cn(
				"relative flex w-full items-center gap-2.5 py-1 text-[14px] transition-all duration-150",
				nested ? "pl-12 pr-4 text-[13px]" : "px-4",
				active
					? "text-foreground bg-foreground/6"
					: "text-foreground/65 hover:text-foreground/90 hover:bg-foreground/3",
			)}
		>
			<span className="flex size-5 shrink-0 items-center justify-center [&>svg]:size-[14px]">
				{node.icon ?? <FileBoxIcon />}
			</span>
			<span className="min-w-0 grow truncate">{node.name}</span>
		</Link>
	);
}

function SidebarFooter() {
	return (
		<div className="flex items-center gap-1 p-2 border-t border-foreground/5 text-foreground/40">
			<a
				href="https://github.com/better-auth/better-auth"
				target="_blank"
				rel="noreferrer noopener"
				className="inline-flex items-center justify-center size-8 hover:text-foreground/70 hover:bg-foreground/5 transition-colors"
				aria-label="GitHub"
			>
				<svg
					role="img"
					viewBox="0 0 24 24"
					fill="currentColor"
					className="size-4"
				>
					<path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
				</svg>
			</a>
			<div className="ms-auto [&_button]:text-foreground/40 [&_button:hover]:text-foreground/70">
				<ThemeToggle />
			</div>
		</div>
	);
}
