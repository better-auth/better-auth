export const marketplaceCategories = [
	"Auth",
	"Security",
	"Payments",
	"Integrations",
	"Utility",
	"Devtools",
] as const;

export type MarketplaceCategory = (typeof marketplaceCategories)[number];

export type MarketplacePluginSource = "official" | "community";

export interface MarketplacePluginAuthor {
	name: string;
	github: string;
	avatar: string;
}

export interface MarketplacePluginSetup {
	/** Named export used in the quick-start snippet */
	exportName: string;
	/** Module specifier, e.g. `better-auth/plugins` or `@better-auth/stripe` */
	from: string;
	/** Optional client export for the DX page */
	clientExportName?: string;
	clientFrom?: string;
}

export interface MarketplacePluginExample {
	/** Short label above the snippet */
	title: string;
	code: string;
	lang?: "ts" | "tsx";
}

export interface MarketplacePlugin {
	/** URL key, e.g. "better-auth-harmony" or "2fa" */
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
	/** Official Better Auth plugin vs community listing */
	official?: boolean;
	/** Full docs path for official plugins */
	docsHref?: string;
	/** Minimal setup used on the official marketplace detail page */
	setup?: MarketplacePluginSetup;
	/** Short showcase snippets for the marketplace detail page */
	examples?: MarketplacePluginExample[];
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

export type MarketplaceSourceFilter =
	| "All"
	| MarketplacePluginSource
	| "featured";
