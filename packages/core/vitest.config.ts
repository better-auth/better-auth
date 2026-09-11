import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		clearMocks: true,
		fsModuleCache: true,
		injectCjsGlobals: false,
		pool: "threads",
		restoreMocks: true,
	},
});
