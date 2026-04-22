import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
	main: {},
	preload: {
		build: {
			externalizeDeps: {
				// Bundle @better-auth/electron instead of externalizing it.
				// Make sure to import only from @better-auth/electron/preload in your preload script.
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
