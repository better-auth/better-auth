import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		server: {
			deps: {
				external: ["electron"],
			},
		},
	},
});
