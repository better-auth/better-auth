import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		rollupOptions: {
			input: {
				client: resolve(__dirname, "src", "client.ts"),
			},
			output: {
				chunkFileNames: "chunks/[name].js",
				entryFileNames: "[name].js",
				format: "es",
			},
			treeshake: false,
		},
		minify: false,
		sourcemap: false,
	},
});
