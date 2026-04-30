import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	root: "src/app",
	base: "/__better-auth/",
	build: {
		outDir: resolve(__dirname, "dist"),
		emptyOutDir: true,
		rollupOptions: {
			input: resolve(__dirname, "src/app/index.html"),
			output: {
				entryFileNames: "auth.js",
				chunkFileNames: "auth-[hash].js",
				assetFileNames: (assetInfo) => {
					if (assetInfo.name?.endsWith(".css")) {
						return "auth.css";
					}
					return "assets/[name]-[hash][extname]";
				},
			},
		},
		minify: "terser",
		sourcemap: false,
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "src"),
		},
	},
});
