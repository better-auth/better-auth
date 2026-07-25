"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Package, Store } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import Footer from "@/components/landing/footer";
import { HalftoneBackground } from "@/components/landing/halftone-bg";
import { PluginCard } from "@/components/marketplace/plugin-card";
import { PluginFilters } from "@/components/marketplace/plugin-filters";
import { MARKETPLACE_SUBMIT_URL } from "@/lib/marketplace/registry";
import type {
	EnrichedMarketplacePlugin,
	MarketplaceCategory,
	MarketplaceSort,
} from "@/lib/marketplace/types";

function matchesQuery(
	plugin: EnrichedMarketplacePlugin,
	query: string,
): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	const haystack = [
		plugin.name,
		plugin.description,
		plugin.author.name,
		plugin.category,
		...(plugin.tags ?? []),
	]
		.join(" ")
		.toLowerCase();
	return haystack.includes(q);
}

function sortPlugins(
	plugins: EnrichedMarketplacePlugin[],
	sort: MarketplaceSort,
): EnrichedMarketplacePlugin[] {
	const copy = [...plugins];
	switch (sort) {
		case "stars":
			return copy.sort(
				(a, b) => (b.enrichment.stars ?? -1) - (a.enrichment.stars ?? -1),
			);
		case "updated":
			return copy.sort((a, b) => {
				const aTime = a.enrichment.lastPush
					? Date.parse(a.enrichment.lastPush)
					: 0;
				const bTime = b.enrichment.lastPush
					? Date.parse(b.enrichment.lastPush)
					: 0;
				return bTime - aTime;
			});
		case "downloads":
			return copy.sort(
				(a, b) =>
					(b.enrichment.npmDownloads ?? -1) - (a.enrichment.npmDownloads ?? -1),
			);
		case "name":
			return copy.sort((a, b) => a.name.localeCompare(b.name));
		default:
			return copy.sort((a, b) => {
				if (a.featured !== b.featured) return a.featured ? -1 : 1;
				return (b.enrichment.stars ?? -1) - (a.enrichment.stars ?? -1);
			});
	}
}

function MarketplaceHero({
	pluginCount,
	className,
}: {
	pluginCount: number;
	className?: string;
}) {
	return (
		<div className={className}>
			<div className="space-y-4">
				<div className="space-y-1">
					<div className="flex items-center gap-1.5">
						<Store className="size-[0.9em] text-foreground/60" />
						<span className="text-sm text-foreground/60">Marketplace</span>
					</div>
					<h1 className="text-2xl md:text-3xl xl:text-4xl text-neutral-800 dark:text-neutral-200 tracking-tight leading-tight">
						Extend Better Auth with community plugins
					</h1>
					<p className="text-sm text-foreground/70 dark:text-foreground/50 leading-relaxed max-w-[240px] pt-1">
						Curated GitHub packages that add providers, flows, and utilities.
						Open any listing to read its README.
					</p>
				</div>

				<div className="flex flex-wrap items-center gap-3 pt-1">
					<a
						href={MARKETPLACE_SUBMIT_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-2 border border-foreground/15 bg-foreground px-3.5 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90"
					>
						Submit yours
					</a>
					<Link
						href="/docs/guides/your-first-plugin"
						className="inline-flex items-center gap-2 border border-foreground/10 px-3.5 py-2 text-xs text-foreground/70 transition-colors hover:border-foreground/20 hover:text-foreground"
					>
						Plugin guide
					</Link>
				</div>

				<div className="hidden lg:block border-t border-foreground/[0.06] pt-4">
					<div className="flex items-baseline justify-between">
						<span className="text-xs text-foreground/70 dark:text-foreground/50 uppercase tracking-wider">
							Listed
						</span>
						<span className="text-xs text-foreground/85 dark:text-foreground/75 font-mono">
							{pluginCount}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

export function MarketplacePageClient({
	plugins,
}: {
	plugins: EnrichedMarketplacePlugin[];
}) {
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState<MarketplaceCategory | "All">("All");
	const [sort, setSort] = useState<MarketplaceSort>("featured");

	const filtered = useMemo(() => {
		const matched = plugins.filter((plugin) => {
			if (category !== "All" && plugin.category !== category) return false;
			return matchesQuery(plugin, query);
		});
		return sortPlugins(matched, sort);
	}, [plugins, query, category, sort]);

	return (
		<div className="flex flex-col lg:flex-row min-h-dvh pt-14 lg:pt-0">
			{/* Left panel — sticky */}
			<div className="hidden lg:block relative w-full lg:w-[30%] lg:h-dvh shrink-0 border-b lg:border-b-0 lg:border-r border-foreground/[0.06] overflow-clip px-5 sm:px-6 lg:px-10 lg:sticky lg:top-0">
				<HalftoneBackground />
				<div className="relative w-full pt-6 md:pt-10 pb-6 lg:pb-0 flex flex-col justify-center lg:h-full">
					<MarketplaceHero pluginCount={plugins.length} />
				</div>
			</div>

			{/* Right panel — plugins */}
			<div className="w-full lg:w-[70%] flex flex-col">
				{/* Mobile header */}
				<div className="lg:hidden relative border-b border-foreground/[0.06] overflow-hidden px-5 sm:px-6">
					<HalftoneBackground />
					<div className="relative py-16">
						<MarketplaceHero pluginCount={plugins.length} />
					</div>
				</div>

				<div className="px-5 pt-5 lg:p-8 lg:pt-20 space-y-6">
					<h2 className="flex items-center gap-3 text-sm sm:text-[15px] font-mono text-neutral-900 dark:text-neutral-100">
						PLUGINS
						<span className="flex-1 h-px bg-foreground/15" />
					</h2>

					<PluginFilters
						query={query}
						onQueryChange={setQuery}
						category={category}
						onCategoryChange={setCategory}
						sort={sort}
						onSortChange={setSort}
						resultCount={filtered.length}
						totalCount={plugins.length}
					/>

					<AnimatePresence mode="popLayout">
						{filtered.length > 0 ? (
							<motion.div
								layout
								className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
							>
								{filtered.map((plugin, index) => (
									<PluginCard key={plugin.slug} plugin={plugin} index={index} />
								))}
							</motion.div>
						) : (
							<motion.div
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								className="flex flex-col items-center justify-center border border-dashed border-foreground/15 px-6 py-16 text-center"
							>
								<Package className="mb-3 size-8 text-foreground/30" />
								<p className="mb-1 text-sm text-foreground/70">
									No plugins match your filters
								</p>
								<p className="mb-5 max-w-sm text-xs text-foreground/45">
									Try a different search, or submit your plugin to the
									marketplace registry.
								</p>
								<a
									href={MARKETPLACE_SUBMIT_URL}
									target="_blank"
									rel="noopener noreferrer"
									className="border border-foreground/15 px-3 py-1.5 text-xs text-foreground/70 transition-colors hover:border-foreground/25 hover:text-foreground"
								>
									Submit a plugin
								</a>
							</motion.div>
						)}
					</AnimatePresence>
				</div>

				<Footer />
			</div>
		</div>
	);
}
