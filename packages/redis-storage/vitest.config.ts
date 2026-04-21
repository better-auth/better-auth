import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		clearMocks: true,
		passWithNoTests: true,
		restoreMocks: true,
	},
});
