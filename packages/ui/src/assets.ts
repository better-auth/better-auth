import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export type PageName =
	| "sign-in"
	| "sign-up"
	| "forgot-password"
	| "reset-password"
	| "verify-email"
	| "profile";

/**
 * Get the path to the dist directory containing the built assets.
 */
export function getDistPath(): string {
	return resolve(__dirname, "..", "dist");
}

/**
 * Template structure for each page
 */
export interface PageTemplates {
	/** Full page template (with page wrapper) */
	page: string;
	/** Embed template (without page wrapper) */
	embed: string;
}

/**
 * All assets for a page
 */
export interface PageAssets {
	/** HTML templates */
	templates: PageTemplates;
	/** Hydration JavaScript */
	hydrate: string;
	/** CSS styles */
	css: string;
}

// Caches
let templatesCache: Record<PageName, PageTemplates> | null = null;
let hydrateCache: string | null = null;
let cssCache: string | null = null;

/**
 * Load the templates.json file containing all page templates.
 */
export function loadTemplates(): Record<PageName, PageTemplates> {
	if (templatesCache) {
		return templatesCache;
	}

	const distPath = getDistPath();
	const templatesPath = join(distPath, "templates.json");

	if (!existsSync(templatesPath)) {
		throw new Error(
			`Templates not found at ${templatesPath}. Run 'pnpm build:templates' first.`,
		);
	}

	const content = readFileSync(templatesPath, "utf-8");
	templatesCache = JSON.parse(content) as Record<PageName, PageTemplates>;
	return templatesCache;
}

/**
 * Load the hydration JavaScript bundle (IIFE format for inline use).
 */
export function loadHydrate(): string {
	if (hydrateCache) {
		return hydrateCache;
	}

	const distPath = getDistPath();
	// Use IIFE format which exposes BetterAuthUI global
	const hydratePath = join(distPath, "hydrate.iife.js");

	if (!existsSync(hydratePath)) {
		throw new Error(
			`Hydration bundle not found at ${hydratePath}. Run 'pnpm build:hydrate' first.`,
		);
	}

	hydrateCache = readFileSync(hydratePath, "utf-8");
	return hydrateCache;
}

/**
 * Load the CSS styles.
 */
export function loadCSS(): string {
	if (cssCache) {
		return cssCache;
	}

	const distPath = getDistPath();
	const cssPath = join(distPath, "auth.css");

	if (!existsSync(cssPath)) {
		throw new Error(
			`CSS not found at ${cssPath}. Run 'pnpm build:hydrate' first.`,
		);
	}

	cssCache = readFileSync(cssPath, "utf-8");
	return cssCache;
}

/**
 * Get the template for a specific page.
 */
export function getPageTemplate(page: PageName, embed = false): string {
	const templates = loadTemplates();
	const pageTemplates = templates[page];

	if (!pageTemplates) {
		throw new Error(`Unknown page: ${page}`);
	}

	return embed ? pageTemplates.embed : pageTemplates.page;
}

/**
 * Load all assets for a specific page.
 */
export function loadPageAssets(page: PageName): PageAssets {
	const templates = loadTemplates();
	const pageTemplates = templates[page];

	if (!pageTemplates) {
		throw new Error(`Unknown page: ${page}`);
	}

	return {
		templates: pageTemplates,
		hydrate: loadHydrate(),
		css: loadCSS(),
	};
}

/**
 * Get paths to asset files.
 */
export function getAssetPaths(): {
	templates: string;
	hydrate: string;
	css: string;
} {
	const distPath = getDistPath();
	return {
		templates: join(distPath, "templates.json"),
		hydrate: join(distPath, "hydrate.iife.js"),
		css: join(distPath, "auth.css"),
	};
}

/**
 * List all available pages.
 */
export function getAvailablePages(): PageName[] {
	return [
		"sign-in",
		"sign-up",
		"forgot-password",
		"reset-password",
		"verify-email",
		"profile",
	];
}

// Legacy exports for backward compatibility
export { loadPageAssets as loadAssets };
export function getPageAssetPaths(page: PageName) {
	const distPath = getDistPath();
	return {
		html: join(distPath, "templates", `${page}.html`),
		js: join(distPath, "hydrate.iife.js"),
		css: join(distPath, "auth.css"),
	};
}

// No longer needed - templates don't have chunks
export function loadChunk(_chunkName: string): string | null {
	return null;
}

export function listChunks(): string[] {
	return [];
}
