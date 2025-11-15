import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		poolOptions: {
			forks: {
				execArgv: ["--expose-gc"],
			},
		},
		// No exclude for adapter tests - this config is specifically for adapter tests
		include: ["src/adapters/**/*.test.ts"],
	},
});
