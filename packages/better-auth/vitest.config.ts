import { defineProject } from "vitest/config";

const solidV2Test = "src/client/solid/v2.test.ts";

export default defineProject({
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
		projects: [
			{ test: { name: "unit", exclude: [solidV2Test] } },
			{
				ssr: { resolve: { conditions: ["dev-source", "browser"] } },
				test: { name: "solid-v2", include: [solidV2Test] },
			},
		],
	},
});
