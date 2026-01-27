import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: ["./packages/*", "./test", "./e2e/*"],
		coverage: {
			include: ["src/**/*"],
			exclude: [],
		}
	},
	ssr: {
		resolve: {
			// we resolve from source files for unit testing
			conditions: ["dev-source"],
		},
	},
});
