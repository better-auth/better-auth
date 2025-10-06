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
	],
});
