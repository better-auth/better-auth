import { sharedVitestConfig } from "@better-auth/config/vitest";
import { defineProject, mergeConfig } from "vitest/config";

export default defineProject(
	mergeConfig(sharedVitestConfig, {
		test: {
			server: {
				deps: {
					external: ["react-native"],
				},
			},
		},
	}),
);
