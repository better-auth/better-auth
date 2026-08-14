import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

// Keep Solid 1 available to its integrations while exercising the client with
// Solid 2's browser runtime.
const solidV2BrowserEntry = fileURLToPath(
	new URL("./node_modules/solid-js-v2/dist/solid.js", import.meta.url),
);

export default defineProject({
	resolve: {
		alias: {
			"solid-js": solidV2BrowserEntry,
			"solid-js-v2": solidV2BrowserEntry,
		},
	},
	test: {
		testTimeout: 10_000,
		execArgv: ["--expose-gc"],
		// Exclude adapter tests by default - they are run separately via test:adapters
		exclude: [
			"**/node_modules/**",
			"**/dist/**",
			"**/src/adapters/**/*.test.ts",
		],
	},
});
