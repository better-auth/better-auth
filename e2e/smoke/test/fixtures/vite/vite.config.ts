import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
	build: {
		rollupOptions: {
			input: {
				client: resolve(__dirname, "src", "client.ts"),
			},
		},
		minify: false,
	},
});
