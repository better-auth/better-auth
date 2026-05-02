/**
 * @better-auth/ui - Server-side exports for Better Auth
 *
 * This module provides utilities for loading and serving the static UI assets.
 * Use this in your Node.js/server environment to serve the authentication pages.
 *
 * @example
 * ```typescript
 * import { loadPageAssets, getPageTemplate, type PageName } from "@better-auth/ui";
 *
 * const assets = loadPageAssets("sign-in");
 * // assets.templates.page - Full page HTML template
 * // assets.templates.embed - Embed mode HTML template
 * // assets.hydrate - Hydration JavaScript
 * // assets.css - Tailwind CSS styles
 *
 * const template = getPageTemplate("sign-in", embed);
 * ```
 */

// Asset loading utilities
export {
	getAssetPaths,
	getAvailablePages,
	getDistPath,
	getPageAssetPaths,
	getPageTemplate,
	listChunks,
	loadAssets,
	loadChunk,
	loadCSS,
	loadHydrate,
	loadPageAssets,
	loadTemplates,
	type PageAssets,
	type PageName,
	type PageTemplates,
} from "./assets.js";

// Types
export type { SocialProvider, UITheme } from "./types/common.js";
export type { BetterAuthUIConfig } from "./types/config.js";

/**
 * Message types sent from parent to iframe (legacy - for backward compatibility)
 */
export type ParentToIframeMessage =
	| { type: "better-auth:css"; css: string }
	| { type: "better-auth:args"; args: Record<string, unknown> };

/**
 * Message types sent from iframe to parent (legacy - for backward compatibility)
 */
export type IframeToParentMessage =
	| { type: "better-auth:loaded" }
	| { type: "better-auth:success"; data: { redirectTo?: string } }
	| { type: "better-auth:error"; error: { code: string; message: string } }
	| { type: "better-auth:signal"; signal: string };
