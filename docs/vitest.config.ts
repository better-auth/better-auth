import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

const docsDir = fileURLToPath(new URL(".", import.meta.url));

export default defineProject({
	resolve: {
		alias: {
			"@": resolve(docsDir, "."),
		},
	},
	test: {
		clearMocks: true,
		restoreMocks: true,
	},
});
