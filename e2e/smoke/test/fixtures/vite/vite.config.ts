import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		rollupOptions: {
			input: {
				server: resolve(__dirname, "src", "server.ts"),
				minimal: resolve(__dirname, "src", "minimal.ts"),
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
		sourcemap: "inline",
	},
});
