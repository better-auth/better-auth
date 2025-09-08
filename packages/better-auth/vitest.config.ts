import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		poolOptions: {
			forks: {
				execArgv: ["--expose-gc"],
			},
		},
	},
});
