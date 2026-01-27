import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: ["./packages/*", "./test", "./e2e/*"],
		slowTestThreshold: 10_000,
		passWithNoTests: true,
	},
	ssr: {
		resolve: {
			// we resolve from source files for unit testing
			conditions: ["dev-source"],
		},
	},
});
