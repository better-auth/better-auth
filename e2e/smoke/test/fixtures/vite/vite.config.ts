import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
	build: {
		rollupOptions: {
			input: {
				server: resolve(__dirname, "src", "server.ts"),
				client: resolve(__dirname, "src", "client.ts"),
			},
			output: {
				entryFileNames: "[name].js",
				format: "es",
			},
			treeshake: false,
		},
		minify: false,
		sourcemap: "inline",
	},
});
