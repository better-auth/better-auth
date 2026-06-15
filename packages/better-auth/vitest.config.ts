import { defineProject } from "vitest/config";
import zodCompiler from "zod-compiler/vite";

export default defineProject({
	plugins: [zodCompiler()],
	test: {
		testTimeout: 10_000,
		execArgv: ["--expose-gc"],
		// Exclude adapter tests by default - they are run separately via test:adapters
		exclude: [
			"**/node_modules/**",
			"**/dist/**",
			"**/src/adapters/**/*.test.ts",
		],
	},
});
