import type { Metadata } from "next";
import { getEnrichedMarketplacePlugins } from "@/lib/marketplace/enrich";
import { createMetadata } from "@/lib/metadata";
import { MarketplacePageClient } from "./marketplace-client";

export const metadata: Metadata = createMetadata({
	title: "Plugin Marketplace",
	description:
		"Browse official Better Auth plugins and curated community packages. Install quickly, then dive into the full docs when you need depth.",
});

// Registry edits (featured, categories, etc.) should show immediately.
// GitHub/npm stats remain cached inside getEnrichedMarketplacePlugins.
export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
	const plugins = await getEnrichedMarketplacePlugins();
	return <MarketplacePageClient plugins={plugins} />;
}
