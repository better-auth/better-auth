/**
 * Main entry point for hydration scripts.
 * This module provides the `hydrate` function that initializes
 * page-specific hydration based on the current page.
 */

import "../styles/globals.css";
import type { BetterAuthUIConfig } from "../types/config";
import { getConfig } from "./config";
import type { HydrationCallbacks } from "./core";
import { hydrateForgotPassword } from "./forgot-password";
import { hydrateProfile } from "./profile";
import { hydrateResetPassword } from "./reset-password";
import { hydrateSignIn } from "./sign-in";
import { hydrateSignUp } from "./sign-up";
import { hydrateVerifyEmail } from "./verify-email";

export type { BetterAuthUIConfig } from "../types/config";
export { getConfig } from "./config";
export type { HydrationCallbacks } from "./core";

export type PageName =
	| "sign-in"
	| "sign-up"
	| "forgot-password"
	| "reset-password"
	| "verify-email"
	| "profile";

/**
 * Hydrate a page with the given configuration.
 * This attaches all event listeners and initializes the page behavior.
 */
export function hydrate(
	page: PageName,
	config: BetterAuthUIConfig,
	callbacks: HydrationCallbacks = {},
): void {
	switch (page) {
		case "sign-in":
			hydrateSignIn(config, callbacks);
			break;
		case "sign-up":
			hydrateSignUp(config, callbacks);
			break;
		case "forgot-password":
			hydrateForgotPassword(config, callbacks);
			break;
		case "reset-password":
			hydrateResetPassword(config, callbacks);
			break;
		case "verify-email":
			hydrateVerifyEmail(config, callbacks);
			break;
		case "profile":
			hydrateProfile(config, callbacks);
			break;
		default:
			console.warn(`Unknown page: ${page}`);
	}
}

/**
 * Auto-hydrate the current page using config from window.__BETTER_AUTH_UI__.
 * Call this at the end of your page script.
 */
export function autoHydrate(callbacks: HydrationCallbacks = {}): void {
	const config = getConfig();
	hydrate(config.page as PageName, config, callbacks);
}

export { authClient } from "./auth-client";
// Re-export core utilities
export * from "./core";
export { hydrateForgotPassword } from "./forgot-password";
export { hydrateProfile } from "./profile";
export { hydrateResetPassword } from "./reset-password";
// Re-export individual hydration functions for direct use
export { hydrateSignIn } from "./sign-in";
export { hydrateSignUp } from "./sign-up";
export { hydrateVerifyEmail } from "./verify-email";
