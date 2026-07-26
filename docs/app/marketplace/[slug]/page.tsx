import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMarketplacePluginDetail } from "@/lib/marketplace/enrich";
import { getMarketplacePluginSlugs } from "@/lib/marketplace/registry";
import { createMetadata } from "@/lib/metadata";
import { PluginDetail } from "./plugin-detail";

// Keep registry fields live; README/stats are cached in enrich helpers.
export const dynamic = "force-dynamic";

interface PageProps {
	params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
	return getMarketplacePluginSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { slug } = await params;
	const plugin = await getMarketplacePluginDetail(slug);
	if (!plugin) {
		return createMetadata({
			title: "Plugin not found",
			description: "This plugin could not be found.",
		});
	}
	const suffix = plugin.official
		? "Official Plugin"
		: plugin.docsHref
			? "Featured Plugin"
			: "Plugin Marketplace";
	return createMetadata({
		title: `${plugin.name} · ${suffix}`,
		description: plugin.description,
		openGraph: {
			title: `${plugin.name} · Better Auth ${suffix}`,
			description: plugin.description,
		},
	});
}

export default async function MarketplacePluginPage({ params }: PageProps) {
	const { slug } = await params;
	const plugin = await getMarketplacePluginDetail(slug);
	if (!plugin) notFound();

	return <PluginDetail plugin={plugin} />;
}
