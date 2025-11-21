import type { ViteUserConfig } from "vitest/config";

/**
 * Shared Vitest configuration for better-auth monorepo
 * This configuration ensures that tests resolve from source files
 * using the "dev-source" condition defined in package.json exports
 */
export const sharedVitestConfig = {
	ssr: {
		resolve: {
			// we resolve from source files for unit testing
			conditions: ["dev-source"],
		},
	},
} satisfies ViteUserConfig;
