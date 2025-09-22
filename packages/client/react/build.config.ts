import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
	entries: ["./src/index"],
	rollup: {
		emitCJS: true,
		esbuild: {
			target: "esnext",
		},
		dts: {
			respectExternal: false,
		},
	},
	declaration: true,
	clean: true,
	externals: ["@better-fetch/fetch", "better-auth", "react", "nanostores"],
});
