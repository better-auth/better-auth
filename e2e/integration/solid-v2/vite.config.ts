import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		solid({
			start: {
				middleware: "./src/middleware.ts",
			},
			ssr: true,
			serverFunctions: true,
		}),
	],
});
