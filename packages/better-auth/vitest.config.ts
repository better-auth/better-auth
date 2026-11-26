import { defineProject } from "vitest/config";

export default defineProject({
	// Solid 2 publishes separate browser and server builds. Inlining Solid
	// lets happy-dom tests resolve its browser development build through these
	// conditions; node tests keep resolving the server build.
	resolve: {
		conditions: ["browser", "development"],
	},
	test: {
		fsModuleCache: true,
		injectCjsGlobals: false,
		testTimeout: 10_000,
		execArgv: ["--expose-gc"],
		// Exclude adapter tests by default - they are run separately via test:adapters
		exclude: [
			"**/node_modules/**",
			"**/dist/**",
			"**/src/adapters/**/*.test.ts",
		],
		server: {
			deps: {
				inline: [/solid-js/, /@solidjs\//],
			},
		},
	},
});
