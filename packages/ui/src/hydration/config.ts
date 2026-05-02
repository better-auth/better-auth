/**
 * Browser-specific configuration utilities.
 * This file contains runtime code that uses browser APIs (window, URLSearchParams).
 */

import type { BetterAuthUIConfig } from "../types/config";
import { defaultConfig } from "../types/config";

declare global {
	interface Window {
		__BETTER_AUTH_UI__?: Partial<BetterAuthUIConfig>;
	}
}

/**
 * Parse embed mode and args from URL query parameters
 */
function parseQueryParams(): { embed: boolean; args: Record<string, unknown> } {
	if (typeof window === "undefined") {
		return { embed: false, args: {} };
	}

	const params = new URLSearchParams(window.location.search);
	const embed = params.get("embed") === "true";

	let args: Record<string, unknown> = {};
	const argsParam = params.get("args");
	if (argsParam) {
		try {
			args = JSON.parse(atob(argsParam));
		} catch {
			console.warn("Failed to parse args query parameter");
		}
	}

	return { embed, args };
}

/**
 * Get the runtime configuration, merging defaults with injected values.
 * This function is browser-only and reads from window.__BETTER_AUTH_UI__.
 */
export function getConfig(): BetterAuthUIConfig {
	const injected =
		typeof window !== "undefined" ? window.__BETTER_AUTH_UI__ : {};
	const queryParams = parseQueryParams();

	return {
		...defaultConfig,
		...injected,
		features: {
			...defaultConfig.features,
			...injected?.features,
		},
		paths: {
			...defaultConfig.paths,
			...injected?.paths,
		},
		embed: queryParams.embed || injected?.embed || false,
		args: { ...injected?.args, ...queryParams.args },
	};
}
