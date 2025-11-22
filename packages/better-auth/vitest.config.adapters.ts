import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		execArgv: ["--expose-gc"],
		// No exclude for adapter tests - this config is specifically for adapter tests
		include: ["src/adapters/**/*.test.ts"],
	},
});
