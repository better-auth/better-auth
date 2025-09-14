import { defineConfig } from "vite";
import { resolve } from "node:path";
import inspect from 'vite-plugin-inspect'

export default defineConfig({
	build: {
		rollupOptions: {
			input: {
				client: resolve(__dirname, "src", "client.ts"),
			},
		},
		minify: false,
		sourcemap: 'inline'
	},
	plugins: [
		inspect({
			build: true,
			outputDir: '.vite-inspect'
		}) as any
	]
});
