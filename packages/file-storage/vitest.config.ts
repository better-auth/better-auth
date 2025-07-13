import { defineConfig } from "vitest/config";

export default defineConfig({
	root: ".",
	test: {
		clearMocks: true,
		globals: true,
		setupFiles: ["dotenv/config"],
	},
});
