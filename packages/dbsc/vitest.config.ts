import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		clearMocks: true,
		restoreMocks: true,
	},
});
