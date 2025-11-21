import { sharedVitestConfig } from "@better-auth/config/vitest";
import { defineProject, mergeConfig } from "vitest/config";

export default defineProject(
	mergeConfig(sharedVitestConfig, {
		test: {
			execArgv: ["--expose-gc"],
			// Exclude adapter tests by default - they are run separately via test:adapters
			exclude: [
				"**/node_modules/**",
				"**/dist/**",
				"**/src/adapters/**/*.test.ts",
			],
		},
	}),
);
