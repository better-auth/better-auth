"use client";

import { Check, ChevronDown, Search, Star } from "lucide-react";
import { marketplaceCategories } from "@/lib/marketplace/registry";
import type {
	MarketplaceCategory,
	MarketplaceSort,
	MarketplaceSourceFilter,
} from "@/lib/marketplace/types";
import { cn } from "@/lib/utils";

interface PluginFiltersProps {
	query: string;
	onQueryChange: (value: string) => void;
	category: MarketplaceCategory | "All";
	onCategoryChange: (value: MarketplaceCategory | "All") => void;
	source: MarketplaceSourceFilter;
	onSourceChange: (value: MarketplaceSourceFilter) => void;
	sort: MarketplaceSort;
	onSortChange: (value: MarketplaceSort) => void;
	resultCount: number;
	totalCount: number;
}

const sourceFilters: MarketplaceSourceFilter[] = [
	"All",
	"official",
	"featured",
	"community",
];

const sortOptions: { value: MarketplaceSort; label: string }[] = [
	{ value: "featured", label: "Featured" },
	{ value: "stars", label: "Stars" },
	{ value: "updated", label: "Recently updated" },
	{ value: "downloads", label: "Downloads" },
	{ value: "name", label: "Name" },
];

function sourceLabel(item: MarketplaceSourceFilter): string {
	switch (item) {
		case "official":
			return "Official";
		case "featured":
			return "Featured";
		case "community":
			return "Community";
		default:
			return "All";
	}
}

export function PluginFilters({
	query,
	onQueryChange,
	category,
	onCategoryChange,
	source,
	onSourceChange,
	sort,
	onSortChange,
	resultCount,
	totalCount,
}: PluginFiltersProps) {
	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
				<div className="relative grow">
					<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground/40" />
					<input
						type="search"
						value={query}
						onChange={(e) => onQueryChange(e.target.value)}
						placeholder="Search plugins, authors, tags…"
						aria-label="Search plugins"
						className="w-full border border-foreground/10 bg-transparent py-2.5 pr-3 pl-10 text-sm text-foreground placeholder:text-foreground/40 outline-none transition-colors focus:border-foreground/25"
					/>
				</div>
				<div className="relative shrink-0">
					<select
						value={sort}
						onChange={(e) => onSortChange(e.target.value as MarketplaceSort)}
						className="appearance-none border border-foreground/10 bg-transparent py-2.5 pr-10 pl-3 text-sm text-foreground/80 outline-none transition-colors focus:border-foreground/25"
						aria-label="Sort plugins"
					>
						{sortOptions.map((option) => (
							<option key={option.value} value={option.value}>
								Sort: {option.label}
							</option>
						))}
					</select>
					<ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-foreground/45" />
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				{sourceFilters.map((item) => {
					const active = source === item;
					return (
						<button
							key={item}
							type="button"
							onClick={() => onSourceChange(item)}
							aria-pressed={active}
							className={cn(
								"inline-flex items-center gap-1 border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors",
								item === "All" &&
									(active
										? "border-foreground/30 bg-foreground/[0.06] text-foreground"
										: "border-foreground/10 text-foreground/55 hover:border-foreground/20 hover:text-foreground/80"),
								item === "official" &&
									(active
										? "border-foreground/40 bg-foreground/[0.06] text-foreground/85"
										: "border-foreground/20 text-foreground/70 hover:border-foreground/35 hover:text-foreground/90"),
								item === "featured" &&
									(active
										? "border-foreground/40 bg-foreground/[0.06] text-foreground/85"
										: "border-foreground/20 text-foreground/60 hover:border-foreground/35 hover:text-foreground/80"),
								item === "community" &&
									(active
										? "border-foreground/20 bg-foreground/[0.04] text-foreground/70"
										: "border-foreground/10 text-foreground/45 hover:border-foreground/20 hover:text-foreground/65"),
							)}
						>
							{item === "official" ? (
								<Check
									className={cn(
										"size-3 shrink-0",
										active ? "text-foreground/60" : "text-foreground/40",
									)}
									aria-hidden
									strokeWidth={2.5}
								/>
							) : null}
							{item === "featured" ? (
								<Star
									className={cn(
										"size-3 shrink-0",
										active ? "text-foreground/60" : "text-foreground/40",
									)}
									aria-hidden
								/>
							) : null}
							{sourceLabel(item)}
						</button>
					);
				})}
			</div>

			<div className="flex flex-wrap items-center gap-2">
				{(["All", ...marketplaceCategories] as const).map((item) => {
					const active = category === item;
					return (
						<button
							key={item}
							type="button"
							onClick={() => onCategoryChange(item)}
							aria-pressed={active}
							className={cn(
								"border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors",
								active
									? "border-foreground/30 bg-foreground/[0.06] text-foreground"
									: "border-foreground/10 text-foreground/55 hover:border-foreground/20 hover:text-foreground/80",
							)}
						>
							{item}
						</button>
					);
				})}
				<span className="ml-auto font-mono text-[11px] text-foreground/45">
					{resultCount} of {totalCount}
				</span>
			</div>
		</div>
	);
}
