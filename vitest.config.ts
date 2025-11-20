import { sharedVitestConfig } from "@better-auth/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

export default defineConfig(
	mergeConfig(sharedVitestConfig, {
		test: {
			projects: ["./packages/*", "./test"],
		},
	}),
);
