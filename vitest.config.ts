import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: [
			"./packages/*",
			"./test",
			"./packages/better-auth/vitest.config.adapters.ts",
		],
	},
	ssr: {
		resolve: {
			// we resolve from source files for unit testing
			conditions: ["dev-source"],
		},
	},
});
