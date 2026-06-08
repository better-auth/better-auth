import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

export default defineProject({
	resolve: {
		alias: {
			"@better-auth/ui/jsx-dev-runtime": fileURLToPath(
				new URL("../ui/src/jsx-dev-runtime.ts", import.meta.url),
			),
			"@better-auth/ui/jsx-runtime": fileURLToPath(
				new URL("../ui/src/jsx-runtime.ts", import.meta.url),
			),
			"@better-auth/ui": fileURLToPath(
				new URL("../ui/src/index.ts", import.meta.url),
			),
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
