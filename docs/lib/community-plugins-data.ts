import { marketplacePlugins } from "./marketplace/registry";

/** @deprecated Prefer MarketplacePlugin from `@/lib/marketplace/types` */
export interface CommunityPlugin {
	name: string;
	url: string;
	description: string;
	author: {
		name: string;
		github: string;
		avatar: string;
	};
}

/** Compatibility export for older consumers — maps from the marketplace registry. */
export const communityPlugins: CommunityPlugin[] = marketplacePlugins.map(
	(plugin) => ({
		name: plugin.name,
		url: `https://github.com/${plugin.repo}`,
		description: plugin.description,
		author: plugin.author,
	}),
);
