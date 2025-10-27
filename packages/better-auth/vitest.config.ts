import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		poolOptions: {
			forks: {
				execArgv: ["--expose-gc"],
			},
		},
		environment: "jsdom", // Simulates a browser environment
		setupFiles: ["./vitest-setup.ts"],
	},
});