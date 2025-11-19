import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "better-auth-adapter",
		execArgv: ["--expose-gc"],
		// No exclude for adapter tests - this config is specifically for adapter tests
		include: ["src/adapters/**/*.test.ts"],
	},
});
