"use client";

import { AnimatePresence, motion } from "framer-motion";
import { SidebarProvider } from "fumadocs-ui/components/sidebar/base";
import type { SidebarTabWithProps } from "fumadocs-ui/components/sidebar/tabs/dropdown";
import { SidebarTabsDropdown } from "fumadocs-ui/components/sidebar/tabs/dropdown";
import { Check } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDocsVersions, useVersionAvailability } from "@/app/docs/provider";
import type { DocsVersion } from "@/lib/docs-versions";
import {
	getVersionFromPathname,
	getVersionTargetHref,
} from "@/lib/docs-versions";

function useDismissablePopover(
	open: boolean,
	setOpen: Dispatch<SetStateAction<boolean>>,
	containerRef: RefObject<HTMLDivElement | null>,
) {
	useEffect(() => {
		if (!open) return;

		function onPointerDown(event: MouseEvent) {
			const target = event.target;
			if (
				containerRef.current &&
				target instanceof Node &&
				!containerRef.current.contains(target)
			) {
				setOpen(false);
			}
		}

		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") setOpen(false);
		}

		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [containerRef, open, setOpen]);
}

function getVersionTitle(version: DocsVersion) {
	if (version.id === "latest") return "Latest Version";
	return `Version ${version.id}`;
}

export function VersionSwitcher({ className }: { className?: string }) {
	const docsVersions = useDocsVersions();
	const pathname = usePathname() || "/docs";
	const router = useRouter();
	const versionAvailability = useVersionAvailability();
	const [open, setOpen] = useState(false);
	const timeout = useRef<number | undefined>(undefined);
	const containerRef = useRef<HTMLDivElement>(null);

	const currentVersion = getVersionFromPathname(pathname);
	useDismissablePopover(open, setOpen, containerRef);
	useEffect(
		() => () => {
			window.clearTimeout(timeout.current);
		},
		[],
	);

	function handleSelect(version: DocsVersion) {
		setOpen(false);
		if (version.id === currentVersion.id) return;

		router.push(
			getVersionTargetHref(
				pathname,
				currentVersion,
				version,
				versionAvailability,
			),
		);
	}

	const displayLabel = currentVersion.label;

	return (
		<div ref={containerRef} className={`relative ${className ?? ""}`}>
			<button
				type="button"
				aria-expanded={open}
				aria-controls="version-switcher-options"
				aria-label={`Documentation version: ${currentVersion.label}`}
				onClick={() => setOpen((v) => !v)}
				onMouseEnter={() => {
					window.clearTimeout(timeout.current);
					setOpen(true);
				}}
				onMouseLeave={() => {
					timeout.current = window.setTimeout(() => setOpen(false), 150);
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
							window.clearTimeout(timeout.current);
						}}
						onMouseLeave={() => {
							timeout.current = window.setTimeout(() => setOpen(false), 150);
						}}
						className="absolute top-full right-0 z-50 min-w-[160px] border border-foreground/[0.08] bg-background shadow-2xl shadow-black/20 dark:shadow-black/60 py-1"
						id="version-switcher-options"
					>
						{docsVersions.map((version, i) => {
							const isActive = version.id === currentVersion.id;
							return (
								<motion.button
									key={version.id}
									type="button"
									aria-pressed={isActive}
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

function VersionTabsDropdown({ desktop = false }: { desktop?: boolean }) {
	const docsVersions = useDocsVersions();
	const pathname = usePathname() || "/docs";
	const versionAvailability = useVersionAvailability();
	const currentVersion = getVersionFromPathname(pathname);
	const [viewportMode, setViewportMode] = useState<"desktop" | "mobile">();

	useEffect(() => {
		const mediaQuery = window.matchMedia("(min-width: 1024px)");
		const updateViewportMode = () => {
			setViewportMode(mediaQuery.matches ? "desktop" : "mobile");
		};
		mediaQuery.addEventListener("change", updateViewportMode);
		updateViewportMode();
		return () => {
			mediaQuery.removeEventListener("change", updateViewportMode);
		};
	}, []);
	const options = useMemo<SidebarTabWithProps[]>(
		() =>
			docsVersions.map((version) => {
				const url = getVersionTargetHref(
					pathname,
					currentVersion,
					version,
					versionAvailability,
				);
				return {
					title: getVersionTitle(version),
					description: version.releaseVersion,
					url,
					urls: new Set([url]),
					props: {
						className: "px-2",
					},
				};
			}),
		[currentVersion, docsVersions, pathname, versionAvailability],
	);

	return (
		<SidebarProvider key={viewportMode}>
			<SidebarTabsDropdown
				aria-label={`Documentation version: ${currentVersion.label}`}
				className={`relative w-full rounded-none border-0 bg-transparent shadow-none [&_p:last-child]:block! ${
					desktop ? "px-4" : "px-5"
				}`}
				options={options}
			/>
		</SidebarProvider>
	);
}

export function MobileVersionSwitcher() {
	return <VersionTabsDropdown />;
}

export function SidebarVersionSwitcher() {
	return (
		<div className="border-y border-foreground/5">
			<VersionTabsDropdown desktop />
		</div>
	);
}
