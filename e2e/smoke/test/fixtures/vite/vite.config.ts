import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
	build: {
		rollupOptions: {
			input: {
				client: resolve(__dirname, "src", "client.ts"),
			},
			output: {
				entryFileNames: "[name].js",
				format: "es",
			},
		},
		minify: false,
		sourcemap: "inline",
	},
});
