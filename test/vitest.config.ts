import { defineConfig } from "vitest/config";

export default defineConfig({
	ssr: {
		resolve: {
			// we resolve from source files for unit testing
			conditions: ["dev-source"],
		},
	},
});
