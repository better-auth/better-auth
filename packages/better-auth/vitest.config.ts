import { defineConfig } from "vitest/config";

export default defineConfig({
	esbuild: {
		target: "esnext",
	},
	test: {
		poolOptions: {
			forks: {
				execArgv: ["--expose-gc"],
			},
		},
	},
});
