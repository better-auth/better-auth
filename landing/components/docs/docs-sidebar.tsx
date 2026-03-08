"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { ChevronDownIcon, GitBranch, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { ListItem } from "@/components/sidebar-content";
import { contents } from "@/components/sidebar-content";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Section = (typeof contents)[number];

export function DocsSidebar() {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const branch = searchParams.get("branch");
	const { setOpenSearch } = useSearchContext();
	const [currentOpen, setCurrentOpen] = useState(0);
	const navRef = useRef<HTMLElement>(null);

	const branchQuery = branch === "canary" ? "?branch=canary" : "";

	const getDefaultOpen = (sections: Section[]) => {
		const defaultValue = sections.findIndex((item) =>
			item.list.some(
				(listItem) =>
					listItem.href === pathname ||
					(listItem.hasSubpages && pathname.startsWith(`${listItem.href}/`)) ||
					listItem.subpages?.some((sp) => pathname === sp.href),
			),
		);
		return defaultValue === -1 ? 0 : defaultValue;
	};

	useEffect(() => {
		setCurrentOpen(getDefaultOpen(contents));
	}, [pathname]);

	// Scroll the active item into view after section expands
	useEffect(() => {
		const timer = setTimeout(() => {
			const nav = navRef.current;
			if (!nav) return;
			const activeEl = nav.querySelector<HTMLElement>("[data-active='true']");
			if (!activeEl) return;

			const navRect = nav.getBoundingClientRect();
			const elRect = activeEl.getBoundingClientRect();

			// Only scroll if the active item is outside the visible area
			const isAbove = elRect.top < navRect.top;
			const isBelow = elRect.bottom > navRect.bottom;

			if (isAbove || isBelow) {
				activeEl.scrollIntoView({ block: "center", behavior: "smooth" });
			}
		}, 380); // wait for expand animation to finish

		return () => clearTimeout(timer);
	}, [pathname, currentOpen]);

	return (
		<motion.aside
			initial={{ x: -24, opacity: 0 }}
			animate={{ x: 0, opacity: 1 }}
			transition={{ duration: 0.28, ease: "easeOut" }}
			className="fixed left-0 top-[42px] bottom-0 w-[22vw] max-w-[300px] hidden lg:flex flex-col z-30 bg-background border-r border-foreground/5 transition-[width] duration-300 ease-out"
		>
			{/* Branch switcher */}
			<BranchSwitcher />

			<button
				type="button"
				className="flex w-full items-center gap-2 px-4 py-2.5 border-b border-foreground/5 text-sm text-foreground/55 hover:text-foreground/80 hover:bg-foreground/3 transition-colors"
				onClick={() => setOpenSearch(true)}
			>
				<Search className="size-4 shrink-0" />
				<span className="truncate">Search</span>
				<kbd className="ml-auto inline-flex items-center gap-0.5 shrink-0 text-[10px] font-mono text-foreground/40 border border-foreground/10 rounded-md px-1.5 py-0.5">
					<span className="text-[11px]">&#8984;</span>K
				</kbd>
			</button>

			{/* Scrollable navigation area */}
			<nav
				ref={navRef}
				className="flex-1 overflow-y-auto overflow-x-hidden pb-3 sidebar-scroll"
				style={{
					maskImage:
						"linear-gradient(to bottom, transparent, white 1rem, white calc(100% - 2rem), transparent 100%)",
				}}
			>
				<MotionConfig
					transition={{ duration: 0.35, type: "spring", bounce: 0 }}
				>
					<div className="flex flex-col">
						{contents.map((section, index) => (
							<div key={section.title}>
								<button
									type="button"
									className={cn(
										"border-b border-foreground/6 w-full text-left flex gap-2 items-center px-4 py-2.5 transition-colors",
										"font-medium text-sm tracking-wider",
										currentOpen === index
											? "text-foreground bg-foreground/3"
											: "text-foreground/70 hover:text-foreground hover:bg-foreground/3",
									)}
									onClick={() => {
										setCurrentOpen((prev) => (prev === index ? -1 : index));
									}}
								>
									<section.Icon className="size-4.5" />
									<span className="grow">{section.title}</span>
									<ChevronDownIcon
										className={cn(
											"h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
											currentOpen === index ? "rotate-180" : "",
										)}
									/>
								</button>
								<AnimatePresence initial={false}>
									{currentOpen === index && (
										<motion.div
											initial={{ opacity: 0, height: 0 }}
											animate={{ opacity: 1, height: "auto" }}
											exit={{ opacity: 0, height: 0 }}
											className="relative overflow-hidden"
										>
											<motion.div className="text-sm">
												<SidebarSection
													section={section}
													pathname={pathname}
													branchQuery={branchQuery}
												/>
											</motion.div>
										</motion.div>
									)}
								</AnimatePresence>
							</div>
						))}
					</div>
				</MotionConfig>
			</nav>

			{/* Footer: GitHub + Theme Toggle */}
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
						<path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
					</svg>
				</a>
				<div className="ms-auto [&_button]:text-foreground/40 [&_button:hover]:text-foreground/70">
					<ThemeToggle />
				</div>
			</div>
		</motion.aside>
	);
}

// ─── Branch Switcher ──────────────────────────────────────────────────────────

function BranchSwitcher() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const branch = searchParams.get("branch") === "canary" ? "canary" : "main";
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const switchBranch = (target: "main" | "canary") => {
		setOpen(false);
		if (target === branch) return;
		const params = new URLSearchParams(searchParams.toString());
		if (target === "canary") {
			params.set("branch", "canary");
		} else {
			params.delete("branch");
		}
		const qs = params.toString();
		router.push(qs ? `${pathname}?${qs}` : pathname);
	};

	return (
		<div ref={ref} className="relative border-b border-foreground/10">
			<button
				type="button"
				className="flex w-full items-center gap-2 px-4 py-3 hover:bg-foreground/[0.02] transition-colors"
				onClick={() => setOpen((v) => !v)}
			>
				<GitBranch className="size-3.5 text-foreground/60 shrink-0" />
				<div className="grow text-left min-w-0">
					<p className="text-[12px] uppercase tracking-wider text-foreground/60 block">
						{branch}{" "}
						<span className="text-[9px] text-foreground/40 ">
							{branch === "main" ? "" : "pre-release"}
						</span>
					</p>
				</div>
				<div className="flex flex-col items-center shrink-0 text-foreground/45">
					<ChevronDownIcon className="size-3 rotate-180 -mb-[3px]" />
					<ChevronDownIcon className="size-3 -mt-[3px]" />
				</div>
			</button>

			<AnimatePresence>
				{open && (
					<motion.div
						initial={{ opacity: 0, y: -4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -4 }}
						transition={{ duration: 0.15 }}
						className="absolute left-2 right-2 lg:left-3 lg:right-3 top-full mt-1 z-50 rounded-md border border-foreground/10 bg-background shadow-md overflow-hidden"
					>
						<button
							type="button"
							className={cn(
								"flex w-full items-center gap-2 px-3 py-2 text-[12px] transition-colors",
								branch === "main"
									? "text-foreground bg-foreground/5"
									: "text-foreground/60 hover:text-foreground hover:bg-foreground/3",
							)}
							onClick={() => switchBranch("main")}
						>
							<span className="grow text-left">main</span>
							<span className="text-[10px] text-foreground/45 uppercase tracking-wider">
								Stable
							</span>
						</button>
						<button
							type="button"
							className={cn(
								"flex w-full items-center gap-2 px-3 py-2 text-[12px] transition-colors",
								branch === "canary"
									? "text-foreground bg-foreground/5"
									: "text-foreground/60 hover:text-foreground hover:bg-foreground/3",
							)}
							onClick={() => switchBranch("canary")}
						>
							<span className="grow text-left">canary</span>
							<Badge
								className="pointer-events-none no-underline! border-dashed decoration-transparent! rounded-none px-1.5 py-0 text-[9px] uppercase tracking-wider text-foreground/55 border-foreground/25"
								variant="outline"
							>
								Pre-release
							</Badge>
						</button>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

// ─── Collapsible Section ──────────────────────────────────────────────────────

function SidebarSection({
	section,
	pathname,
	branchQuery,
}: {
	section: Section;
	pathname: string;
	branchQuery: string;
}) {
	return (
		<div className="pt-0 pb-1">
			{section.href && (
				<SidebarLink
					href={`${section.href}${branchQuery}`}
					active={pathname === section.href}
				>
					Overview
				</SidebarLink>
			)}
			{section.list.map((item, i) => {
				if (item.separator) {
					return (
						<div
							key={`sep-${item.title}-${i}`}
							className="flex flex-row items-center gap-2 mx-4 lg:mx-7 my-2"
						>
							<p className="text-[10px] text-foreground/45 uppercase tracking-wider">
								{item.title}
							</p>
							<div className="grow h-px bg-border" />
						</div>
					);
				}
				if (item.group) {
					return (
						<div
							key={`group-${item.title}-${i}`}
							className="flex flex-row items-center gap-2 mx-4 my-1 lg:mx-7"
						>
							<p className="text-[10px] text-foreground/45 uppercase tracking-wider">
								{item.title}
							</p>
							<div className="grow h-px bg-border" />
						</div>
					);
				}
				if (!item.href) return null;
				const hasSubpages = !!(item.subpages && item.subpages.length > 0);
				const subpageMatch =
					hasSubpages && item.subpages?.some((sp) => pathname === sp.href);
				const active =
					pathname === item.href ||
					subpageMatch ||
					(!!item.hasSubpages && pathname.startsWith(`${item.href}/`));

				return (
					<SidebarItemWithSubpages
						key={item.href}
						item={item}
						active={active}
						pathname={pathname}
						branchQuery={branchQuery}
						hasSubpages={hasSubpages}
					/>
				);
			})}
		</div>
	);
}

// ─── Sidebar Item with Subpages ───────────────────────────────────────────────

function SidebarItemWithSubpages({
	item,
	active,
	pathname,
	branchQuery,
	hasSubpages,
}: {
	item: ListItem;
	active: boolean;
	pathname: string;
	branchQuery: string;
	hasSubpages: boolean | undefined;
}) {
	const showSubpages = hasSubpages && active;

	return (
		<div>
			<SidebarLink
				href={`${item.href}${branchQuery}`}
				active={active}
				icon={
					<span className="min-w-5 [&>svg]:size-[14px]">
						<item.icon className="text-foreground/75" />
					</span>
				}
				isNew={item.isNew}
			>
				{item.title}
			</SidebarLink>
			<AnimatePresence initial={false}>
				{showSubpages && item.subpages && (
					<motion.div
						initial={{ opacity: 0, height: 0 }}
						animate={{ opacity: 1, height: "auto" }}
						exit={{ opacity: 0, height: 0 }}
						transition={{ duration: 0.35, type: "spring", bounce: 0 }}
						className="overflow-hidden"
					>
						<div className="relative before:absolute before:left-[calc(1.75rem+0.75rem)] before:top-0 before:bottom-0 before:w-px before:bg-foreground/20">
							{item.subpages.map((subpage, i) => {
								if (subpage.group) {
									return (
										<div
											key={`subgroup-${subpage.title}-${i}`}
											className="flex flex-row items-center gap-2 pl-[calc(1.75rem+0.75rem+0.75rem)] pr-4 py-1.5 mt-1 first:mt-0"
										>
											<p className="text-[10px] text-foreground/45 uppercase tracking-wider">
												{subpage.title}
											</p>
											<div className="grow h-px bg-border" />
										</div>
									);
								}
								if (!subpage.href) return null;
								return (
									<SubpageLink
										key={subpage.href}
										href={`${subpage.href}${branchQuery}`}
										active={pathname === subpage.href}
										icon={
											subpage.icon ? (
												<subpage.icon className="text-current" />
											) : undefined
										}
									>
										{subpage.title}
									</SubpageLink>
								);
							})}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

// ─── Subpage Link ─────────────────────────────────────────────────────────────

function SubpageLink({
	href,
	active,
	children,
}: {
	href: string;
	active: boolean;
	children: ReactNode;
}) {
	return (
		<Link
			href={href}
			data-active={active || undefined}
			className={cn(
				"relative flex items-center gap-1 pl-[calc(1.75rem+0.75rem+0.75rem)] pr-4 py-1 text-[13px] transition-all duration-150",
				active
					? "text-foreground bg-foreground/6"
					: "text-foreground/55 hover:text-foreground/80 hover:bg-foreground/3",
			)}
		>
			<span className="truncate">{children}</span>
		</Link>
	);
}

// ─── Sidebar Link ─────────────────────────────────────────────────────────────

function SidebarLink({
	href,
	active,
	icon,
	isNew,
	children,
}: {
	href: string;
	active: boolean;
	icon?: ReactNode;
	isNew?: boolean;
	children: ReactNode;
}) {
	return (
		<Link
			href={href}
			data-active={active || undefined}
			className={`
        relative flex items-center gap-2.5 px-4 py-1 text-[14px] transition-all duration-150
        ${
					active
						? "text-foreground bg-foreground/6"
						: "text-foreground/65 hover:text-foreground/90 hover:bg-foreground/3"
				}
      `}
		>
			{icon && (
				<span
					className={`transition-colors duration-150 ${
						active ? "text-foreground" : "text-foreground/65"
					}`}
				>
					{icon}
				</span>
			)}
			<span className="truncate grow">{children}</span>
			{isNew && <NewBadge isSelected={active} />}
		</Link>
	);
}

function NewBadge({ isSelected }: { isSelected?: boolean }) {
	return (
		<Badge
			className={cn(
				"pointer-events-none no-underline! border-dashed decoration-transparent! rounded-none px-1.5 py-0 text-[9px] uppercase tracking-wider",
				isSelected
					? "border-solid! bg-foreground/10 text-foreground"
					: "text-foreground/55 border-foreground/25",
			)}
			variant="outline"
		>
			New
		</Badge>
	);
}
