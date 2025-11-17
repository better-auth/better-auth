import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		server: {
			deps: {
				external: ["react-native"],
			},
		},
	},
});
