import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
	entries: ["src/index"],
	externals: [],
	declaration: true,
	clean: true,
	failOnWarn: false,
	rollup: {
		emitCJS: true,
		esbuild: {
			target: "es2022",
			minify: false,
			format: "esm",
		},
	},
});
