import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

export default defineProject({
	resolve: {
		alias: {
			"@better-auth/ui/jsx-dev-runtime": fileURLToPath(
				new URL("../ui/src/jsx-dev-runtime.ts", import.meta.url),
			),
			"@better-auth/ui/jsx-runtime": fileURLToPath(
				new URL("../ui/src/jsx-runtime.ts", import.meta.url),
			),
			"@better-auth/ui": fileURLToPath(
				new URL("../ui/src/index.ts", import.meta.url),
			),
		},
	},
	test: {
		clearMocks: true,
		restoreMocks: true,
		testTimeout: 10_000,
	},
});
