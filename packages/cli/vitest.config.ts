import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		maxConcurrency: 1,
	},
});
