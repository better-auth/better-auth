import { resolve } from "node:path";
import { defineConfig } from "vite";

/**
 * Vite configuration for @better-auth/ui
 *
 * New architecture:
 * 1. Templates are generated at build time using React SSR (separate script)
 * 2. Hydration JS is bundled here (vanilla JS, no React runtime)
 * 3. CSS is processed by Tailwind
 *
 * Build outputs:
 * - dist/hydrate.js - Main hydration bundle
 * - dist/auth.css - Tailwind CSS
 * - dist/templates.json - Generated HTML templates (from generate-templates script)
 */
export default defineConfig({
	build: {
		outDir: resolve(__dirname, "dist"),
		emptyOutDir: false,
		lib: {
			entry: resolve(__dirname, "src/hydration/index.ts"),
			name: "BetterAuthUI",
			formats: ["es", "iife"],
			fileName: (format) => {
				if (format === "es") return "hydrate.js";
				if (format === "iife") return "hydrate.iife.js";
				return `hydrate.${format}.js`;
			},
		},
		rollupOptions: {
			output: {
				assetFileNames: (assetInfo) => {
					if (assetInfo.name?.endsWith(".css")) {
						return "auth.css";
					}
					return "assets/[name]-[hash][extname]";
				},
				globals: {},
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
	css: {
		// Use postcss.config.js for Tailwind processing
	},
});
