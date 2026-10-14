import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		clearMocks: true,
		name: "release-tooling",
		restoreMocks: true,
	},
});
