import { Check, Star } from "lucide-react";
import type { MarketplacePlugin } from "@/lib/marketplace/types";
import { cn } from "@/lib/utils";

export type PluginSourceKind = "official" | "featured" | "community";

export function getPluginSourceKind(
	plugin: Pick<MarketplacePlugin, "official" | "featured">,
): PluginSourceKind {
	if (plugin.official) return "official";
	if (plugin.featured) return "featured";
	return "community";
}

const sizeClasses = {
	sm: "gap-1 px-1.5 py-0.5 text-[10px]",
	md: "gap-1 px-1.5 py-0.5 text-[9px] tracking-widest",
} as const;

export function PluginSourceBadge({
	source,
	size = "sm",
	className,
}: {
	source: PluginSourceKind;
	size?: keyof typeof sizeClasses;
	className?: string;
}) {
	if (source === "official") {
		return (
			<span
				className={cn(
					"inline-flex items-center border border-foreground/40 bg-background/60 font-mono font-medium uppercase tracking-wider text-foreground/80",
					sizeClasses[size],
					className,
				)}
			>
				<Check
					className="size-2.5 shrink-0 text-foreground/60"
					aria-hidden
					strokeWidth={2.5}
				/>
				Official
			</span>
		);
	}

	if (source === "featured") {
		return (
			<span
				className={cn(
					"inline-flex items-center border border-foreground/30 bg-background/60 font-mono uppercase tracking-wider text-foreground/70",
					sizeClasses[size],
					className,
				)}
			>
				<Star className="size-2.5 shrink-0 text-foreground/50" aria-hidden />
				Featured
			</span>
		);
	}

	return (
		<span
			className={cn(
				"inline-flex items-center border border-foreground/15 bg-background/60 font-mono uppercase tracking-wider text-foreground/45",
				sizeClasses[size],
				className,
			)}
		>
			Community
		</span>
	);
}
