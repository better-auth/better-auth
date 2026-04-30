/**
 * @better-auth/ui - Server-side exports for Better Auth
 *
 * This module provides utilities for loading and serving the static UI assets.
 * Use this in your Node.js/server environment to serve the authentication pages.
 *
 * @example
 * ```typescript
 * import { loadAssets, type BetterAuthUIConfig } from "@better-auth/ui";
 *
 * const assets = loadAssets();
 * // assets.html - HTML template (inject config here)
 * // assets.js - React application bundle
 * // assets.css - Tailwind CSS styles
 * ```
 */

// Asset loading utilities
export { getAssetPaths, getDistPath, loadAssets } from "./assets.js";

// Types
export type { SocialProvider, UITheme } from "./types/common.js";

/**
 * Configuration injected into the UI at runtime.
 * Set this on `window.__BETTER_AUTH_UI__` before the React app loads.
 */
export interface BetterAuthUIConfig {
	apiBaseUrl: string;
	appName: string;
	logo?: string;
	redirectTo: string;
	socialProviders: Array<{
		id: string;
		name: string;
		icon?: string;
	}>;
	features: {
		emailPassword: boolean;
		passkey: boolean;
		magicLink: boolean;
		rememberMe: boolean;
		emailVerification: boolean;
	};
	paths: {
		signIn: string;
		signUp: string;
		forgotPassword: string;
		resetPassword: string;
		verifyEmail: string;
		profile: string;
	};
	minPasswordLength: number;
	page:
		| "sign-in"
		| "sign-up"
		| "forgot-password"
		| "reset-password"
		| "verify-email"
		| "profile";
}
