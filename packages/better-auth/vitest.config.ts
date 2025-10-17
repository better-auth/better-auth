import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		setupFiles: ["./vitest.setup.ts"],
		poolOptions: {
			forks: {
				execArgv: ["--expose-gc"],
			},
		},
	},
});
