"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { DocsVersion } from "@/lib/docs-versions";
import {
	docsVersions,
	getVersionFromPathname,
	versionedDocsHref,
} from "@/lib/docs-versions";

export function VersionSwitcher({ className }: { className?: string }) {
	const pathname = usePathname() || "/docs";
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const timeout = useRef<NodeJS.Timeout>(undefined);
	const containerRef = useRef<HTMLDivElement>(null);

	const currentVersion = getVersionFromPathname(pathname);

	useEffect(() => {
		function onClickOutside(e: MouseEvent) {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		}
		if (open) {
			document.addEventListener("mousedown", onClickOutside);
		}
		return () => document.removeEventListener("mousedown", onClickOutside);
	}, [open]);

	function handleSelect(version: DocsVersion) {
		setOpen(false);
		if (version.slug === currentVersion.slug) return;

		// Extract the page path from the current pathname
		let pagePath: string;
		if (currentVersion.slug) {
			// Currently on a versioned path: /docs/beta/introduction -> /docs/introduction
			pagePath = pathname.replace(`/docs/${currentVersion.slug}`, "/docs");
		} else {
			pagePath = pathname;
		}

		const targetHref = versionedDocsHref(pagePath, version);
		router.push(targetHref);
	}

	const displayLabel = currentVersion.label;

	return (
		<div ref={containerRef} className={`relative ${className ?? ""}`}>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				onMouseEnter={() => {
					clearTimeout(timeout.current);
					setOpen(true);
				}}
				onMouseLeave={() => {
					timeout.current = setTimeout(() => setOpen(false), 150);
				}}
				className="flex items-center gap-1.5 px-3 py-1.5 h-full transition-colors duration-150 hover:bg-foreground/[0.04]"
			>
				<span className="font-mono text-[10px] uppercase tracking-wider text-foreground/65 dark:text-foreground/50 whitespace-nowrap">
					{displayLabel}
				</span>
				{currentVersion.badge && (
					<span className="font-mono text-[9px] uppercase tracking-wider px-1 py-0.5 border border-dashed border-foreground/25 text-foreground/55">
						{currentVersion.badge}
					</span>
				)}
				<svg
					className={`h-2 w-2 text-foreground/55 dark:text-foreground/40 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
					viewBox="0 0 10 6"
					fill="none"
				>
					<path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.2" />
				</svg>
			</button>

			<AnimatePresence>
				{open && (
					<motion.div
						initial={{ opacity: 0, y: -4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -4 }}
						transition={{ duration: 0.12, ease: "easeOut" }}
						onMouseEnter={() => {
							clearTimeout(timeout.current);
						}}
						onMouseLeave={() => {
							timeout.current = setTimeout(() => setOpen(false), 150);
						}}
						className="absolute top-full right-0 z-50 min-w-[160px] border border-foreground/[0.08] bg-background shadow-2xl shadow-black/20 dark:shadow-black/60 py-1"
					>
						{docsVersions.map((version, i) => {
							const isActive = version.slug === currentVersion.slug;
							return (
								<motion.button
									key={version.version}
									type="button"
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									transition={{
										duration: 0.1,
										delay: i * 0.02,
									}}
									onClick={() => handleSelect(version)}
									className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-foreground/[0.06] transition-colors duration-150 cursor-pointer"
								>
									<span className="w-3.5 shrink-0">
										{isActive && (
											<Check className="h-3 w-3 text-foreground/70" />
										)}
									</span>
									<span className="font-mono text-[10px] uppercase tracking-wider text-foreground/75 dark:text-foreground/60 whitespace-nowrap">
										{version.label}
									</span>
									{version.badge && (
										<span className="font-mono text-[9px] uppercase tracking-wider px-1 py-0.5 border border-dashed border-foreground/25 text-foreground/55">
											{version.badge}
										</span>
									)}
								</motion.button>
							);
						})}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

/** Simplified version for mobile — just a row of buttons. */
export function MobileVersionSwitcher() {
	const pathname = usePathname() || "/docs";
	const router = useRouter();
	const currentVersion = getVersionFromPathname(pathname);

	function handleSelect(version: DocsVersion) {
		if (version.slug === currentVersion.slug) return;
		let pagePath: string;
		if (currentVersion.slug) {
			pagePath = pathname.replace(`/docs/${currentVersion.slug}`, "/docs");
		} else {
			pagePath = pathname;
		}
		router.push(versionedDocsHref(pagePath, version));
	}

	return (
		<div className="flex items-center gap-1 px-2">
			{docsVersions.map((version) => {
				const isActive = version.slug === currentVersion.slug;
				return (
					<button
						key={version.version}
						type="button"
						onClick={() => handleSelect(version)}
						className={`flex items-center gap-1 px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors duration-150 ${
							isActive
								? "text-foreground bg-foreground/10"
								: "text-foreground/50 hover:text-foreground/80 hover:bg-foreground/5"
						}`}
					>
						{version.label}
						{version.badge && (
							<span className="text-[9px] px-1 py-0.5 border border-dashed border-foreground/25 text-foreground/55">
								{version.badge}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}

/** Version switcher for the docs sidebar — full-width popover dropdown below the search bar. */
export function SidebarVersionSwitcher() {
	const pathname = usePathname() || "/docs";
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const currentVersion = getVersionFromPathname(pathname);

	useEffect(() => {
		function onClickOutside(e: MouseEvent) {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		}
		if (open) {
			document.addEventListener("mousedown", onClickOutside);
		}
		return () => document.removeEventListener("mousedown", onClickOutside);
	}, [open]);

	function handleSelect(version: DocsVersion) {
		setOpen(false);
		if (version.slug === currentVersion.slug) return;
		let pagePath: string;
		if (currentVersion.slug) {
			pagePath = pathname.replace(`/docs/${currentVersion.slug}`, "/docs");
		} else {
			pagePath = pathname;
		}
		router.push(versionedDocsHref(pagePath, version));
	}

	return (
		<div ref={containerRef} className="relative border-y border-foreground/5">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="group/version flex w-full items-center gap-2 px-4 py-[9px] text-sm text-foreground/55 hover:text-foreground/80 hover:bg-foreground/3 transition-colors"
			>
				<svg
					className="size-4 shrink-0 text-foreground opacity-55 group-hover/version:opacity-80 transition-opacity"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M7 8.25a2.75 2.75 0 1 0 0-5.5a2.75 2.75 0 0 0 0 5.5m0 0V12m0 3.75a2.75 2.75 0 1 0 0 5.5a2.75 2.75 0 0 0 0-5.5m0 0V12m10-3.75a2.75 2.75 0 1 0 0-5.5a2.75 2.75 0 0 0 0 5.5m0 0V9a3 3 0 0 1-3 3H7" />
				</svg>
				<span className="truncate">{currentVersion.label}</span>
				{currentVersion.badge && (
					<span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 border border-dashed border-foreground/20 text-foreground/45">
						{currentVersion.badge}
					</span>
				)}
				{/* Up/down chevron */}
				<svg
					className="ml-auto size-4 shrink-0 text-foreground/40"
					viewBox="0 0 16 16"
					fill="none"
				>
					<path
						d="M5 6.5L8 3.5L11 6.5"
						stroke="currentColor"
						strokeWidth="1.2"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
					<path
						d="M5 9.5L8 12.5L11 9.5"
						stroke="currentColor"
						strokeWidth="1.2"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</button>

			<AnimatePresence>
				{open && (
					<motion.div
						initial={{ opacity: 0, y: -4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -4 }}
						transition={{ duration: 0.12, ease: "easeOut" }}
						className="absolute left-0 right-0 top-full z-50 border-b border-foreground/[0.08] bg-background shadow-lg shadow-black/10 dark:shadow-black/40 py-1"
					>
						{docsVersions.map((version) => {
							const isActive = version.slug === currentVersion.slug;
							return (
								<button
									key={version.version}
									type="button"
									onClick={() => handleSelect(version)}
									className={`flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors duration-150 ${
										isActive
											? "text-foreground bg-foreground/5"
											: "text-foreground/55 hover:text-foreground/80 hover:bg-foreground/3"
									}`}
								>
									<span className="size-4 shrink-0 flex items-center justify-center">
										{isActive && (
											<Check className="size-3.5 text-foreground/70" />
										)}
									</span>
									<span className="truncate">{version.label}</span>
									{version.badge && (
										<span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 border border-dashed border-foreground/20 text-foreground/45">
											{version.badge}
										</span>
									)}
								</button>
							);
						})}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
