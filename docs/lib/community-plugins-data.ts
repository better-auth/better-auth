import { communityMarketplacePlugins } from "./marketplace/registry";

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

/** Compatibility export for older consumers — maps from the community registry. */
export const communityPlugins: CommunityPlugin[] =
	communityMarketplacePlugins.map((plugin) => ({
		name: plugin.name,
		// Preserve the historical npm listing URL for this package.
		url:
			plugin.slug === "dbsc-toolkit-better-auth" && plugin.npmPackage
				? `https://www.npmjs.com/package/${plugin.npmPackage}`
				: `https://github.com/${plugin.repo}`,
		description: plugin.description,
		author: plugin.author,
	}));
