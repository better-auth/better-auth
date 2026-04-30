import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Get the path to the dist directory containing the built assets.
 * In development, this points to the local dist folder.
 * In production (when installed as a package), this resolves to node_modules.
 */
export function getDistPath(): string {
	return resolve(__dirname, "..", "dist");
}

/**
 * Get the paths to all static assets.
 */
export function getAssetPaths(): {
	html: string;
	js: string;
	css: string;
} {
	const distPath = getDistPath();
	return {
		html: join(distPath, "index.html"),
		js: join(distPath, "auth.js"),
		css: join(distPath, "auth.css"),
	};
}

/**
 * Load all static assets into memory.
 * Results are cached for subsequent calls.
 */
let cachedAssets: { html: string; js: string; css: string } | null = null;

export function loadAssets(): {
	html: string;
	js: string;
	css: string;
} {
	if (cachedAssets) {
		return cachedAssets;
	}

	const paths = getAssetPaths();
	cachedAssets = {
		html: readFileSync(paths.html, "utf-8"),
		js: readFileSync(paths.js, "utf-8"),
		css: readFileSync(paths.css, "utf-8"),
	};

	return cachedAssets;
}
