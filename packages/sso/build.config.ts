import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
	declaration: true,
	rollup: {
		emitCJS: true,
	},
	outDir: "dist",
	clean: false,
	failOnWarn: false,
	externals: ["better-auth", "better-call", "@better-fetch/fetch", "stripe"],
});
