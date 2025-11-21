import { sharedVitestConfig } from "@better-auth/config/vitest";
import { defineProject, mergeConfig } from "vitest/config";

export default defineProject(
	mergeConfig(sharedVitestConfig, {
		test: {
			execArgv: ["--expose-gc"],
			// No exclude for adapter tests - this config is specifically for adapter tests
			include: ["src/adapters/**/*.test.ts"],
		},
	}),
);
