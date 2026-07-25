export const marketplaceCategories = [
	"Auth",
	"Security",
	"Payments",
	"Integrations",
	"Utility",
	"Devtools",
] as const;

export type MarketplaceCategory = (typeof marketplaceCategories)[number];

export interface MarketplacePluginAuthor {
	name: string;
	github: string;
	avatar: string;
}

export interface MarketplacePlugin {
	/** URL key, e.g. "better-auth-harmony" */
	slug: string;
	/** Display / package name */
	name: string;
	/** GitHub "owner/repo" */
	repo: string;
	description: string;
	category: MarketplaceCategory;
	tags?: string[];
	/** npm package name for install copy + download stats */
	npmPackage?: string;
	author: MarketplacePluginAuthor;
	featured?: boolean;
}

export interface MarketplacePluginEnrichment {
	stars: number | null;
	lastPush: string | null;
	defaultBranch: string;
	license: string | null;
	topics: string[];
	openIssues: number | null;
	/** All-time npm downloads (null when package missing or fetch fails). */
	npmDownloads: number | null;
}

export interface EnrichedMarketplacePlugin extends MarketplacePlugin {
	enrichment: MarketplacePluginEnrichment;
}

export interface MarketplacePluginDetail extends EnrichedMarketplacePlugin {
	readme: string | null;
	/** Repo-relative path of the rendered README (for resolving relative assets). */
	readmeFilePath: string | null;
}

export type MarketplaceSort =
	| "stars"
	| "updated"
	| "name"
	| "downloads"
	| "featured";
