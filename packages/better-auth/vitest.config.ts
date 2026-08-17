import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

const solidV1BrowserEntry = fileURLToPath(
	new URL("./node_modules/solid-js/dist/solid.js", import.meta.url),
);

// Run the regular Solid tests against Solid 1's browser runtime. The Solid 2
// compatibility test mocks "solid-js" with this separate browser entry.
const solidV2BrowserEntry = fileURLToPath(
	new URL("./node_modules/solid-js-v2/dist/solid.js", import.meta.url),
);

export default defineProject({
	resolve: {
		alias: {
			"solid-js": solidV1BrowserEntry,
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
