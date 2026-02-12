import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
	main: {},
	preload: {
		build: {
			externalizeDeps: {
				// Don't prevent bundling @better-auth/electron into the preload script.
				exclude: ["@better-auth/electron"],
			},
		},
	},
	renderer: {
		resolve: {
			alias: {
				"@renderer": resolve("src/renderer/src"),
			},
		},
		plugins: [tailwindcss(), react()],
	},
});
