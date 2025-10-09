import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
	rollup: {
		emitCJS: true,
	},
	declaration: true,
	outDir: "dist",
	clean: true,
	failOnWarn: false,
	entries: [
		"./src/index.ts",
		"./src/db/index.ts",
		"./src/db/adapter/index.ts",
		"./src/async_hooks/index.ts",
		"./src/env/index.ts",
		"./src/oauth2/index.ts",
		"./src/middleware/index.ts",
		"./src/social-providers/index.ts",
		"./src/utils/index.ts",
		"./src/error/index.ts",
	],
});
