"use client";

import { motion } from "framer-motion";
import { Download, Star } from "lucide-react";
import Link from "next/link";
import { ViewTransition } from "react";
import { formatCount } from "@/lib/marketplace/format";
import type { EnrichedMarketplacePlugin } from "@/lib/marketplace/types";
import { cn } from "@/lib/utils";

export function PluginCard({
	plugin,
	index,
}: {
	plugin: EnrichedMarketplacePlugin;
	index: number;
}) {
	const transitionName = `marketplace-plugin-${plugin.slug}`;

	return (
		<motion.div
			layout
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.3) }}
		>
			<Link
				href={`/marketplace/${plugin.slug}`}
				transitionTypes={["nav-forward"]}
				className="block h-full"
			>
				<ViewTransition name={transitionName} share="marketplace-plugin-morph">
					<div
						className={cn(
							"group relative flex h-full flex-col overflow-hidden border border-foreground/10 bg-background p-5 transition-colors hover:border-foreground/25",
							plugin.featured && "border-foreground/20",
						)}
					>
						{/* Diagonal dash background (brand motif) */}
						<span
							aria-hidden
							className="pointer-events-none absolute inset-0 text-foreground opacity-[0.035] transition-opacity group-hover:opacity-[0.06]"
							style={{
								backgroundImage: `repeating-linear-gradient(
									-45deg,
									transparent,
									transparent 4px,
									currentColor 4px,
									currentColor 5px
								)`,
							}}
						/>

						{plugin.featured && (
							<span className="absolute top-0 right-0 z-10 border-b border-l border-foreground/15 bg-background/80 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-foreground/50">
								Featured
							</span>
						)}

						<div className="relative z-10 mb-3 flex items-start justify-between gap-3">
							<span className="font-mono text-[10px] uppercase tracking-wider text-foreground/45">
								{plugin.category}
							</span>
							<span className="inline-flex items-center gap-2.5 font-mono text-[11px] tabular-nums text-foreground/50">
								<span className="inline-flex items-center gap-1">
									<Star className="size-3 fill-foreground/40 text-foreground/40" />
									{formatCount(plugin.enrichment.stars)}
								</span>
								<span className="inline-flex items-center gap-1">
									<Download className="size-3 text-foreground/40" />
									{formatCount(plugin.enrichment.npmDownloads)}
								</span>
							</span>
						</div>

						<h2 className="relative z-10 mb-2 font-mono text-sm font-medium text-foreground transition-colors group-hover:text-foreground">
							{plugin.name}
						</h2>
						<p className="relative z-10 mb-3 grow text-sm leading-relaxed text-muted-foreground line-clamp-3">
							{plugin.description}
						</p>

						{plugin.tags && plugin.tags.length > 0 && (
							<div className="relative z-10 mb-3 flex flex-wrap gap-1.5">
								{plugin.tags.slice(0, 3).map((tag) => (
									<span
										key={tag}
										className="border border-foreground/10 bg-background/60 px-1.5 py-0.5 font-mono text-[10px] text-foreground/55"
									>
										{tag}
									</span>
								))}
								{plugin.tags.length > 3 && (
									<span className="px-1 py-0.5 font-mono text-[10px] text-foreground/40">
										+{plugin.tags.length - 3}
									</span>
								)}
							</div>
						)}

						<div className="relative z-10 mt-auto flex items-center gap-2 border-t border-foreground/8 pt-3">
							<img
								src={plugin.author.avatar}
								alt=""
								className="size-5 rounded-full border border-foreground/10 opacity-80"
							/>
							<span className="truncate text-xs text-foreground/55">
								{plugin.author.name}
							</span>
						</div>
					</div>
				</ViewTransition>
			</Link>
		</motion.div>
	);
}
