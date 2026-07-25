import type { Metadata } from "next";
import { getEnrichedMarketplacePlugins } from "@/lib/marketplace/enrich";
import { createMetadata } from "@/lib/metadata";
import { MarketplacePageClient } from "./marketplace-client";

export const metadata: Metadata = createMetadata({
	title: "Plugin Marketplace",
	description:
		"Browse curated community plugins that extend Better Auth — providers, flows, utilities, and more. Open any listing to read its README.",
});

// Registry edits (featured, categories, etc.) should show immediately.
// GitHub/npm stats remain cached inside getEnrichedMarketplacePlugins.
export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
	const plugins = await getEnrichedMarketplacePlugins();
	return <MarketplacePageClient plugins={plugins} />;
}
