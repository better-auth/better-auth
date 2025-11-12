import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		setupFiles: ["./vitest.setup.ts"],
		poolOptions: {
			forks: {
				execArgv: ["--expose-gc"],
			},
		},
		// Exclude adapter tests by default - they are run separately via test:adapters
		exclude: [
			"**/node_modules/**",
			"**/dist/**",
			"**/src/adapters/**/*.test.ts",
		],
	},
});
