import { defineBuildConfig } from "unbuild";
import packagejson from "./package.json";
export default defineBuildConfig({
	rollup: {
		emitCJS: true,
		esbuild: {
			treeShaking: true,
		},
	},
	declaration: true,
	outDir: "dist",
	clean: true,
	externals: [
		...Object.keys(packagejson.dependencies || {}),
		...Object.keys(packagejson.devDependencies || {}),
	],
	entries: [
		{
			input: "./src/",
			format: "esm",
			ext: "mjs",
			globOptions: {
				// test folders
				ignore: [
					"**/*.test.ts",
					"**/*.spec.ts",
					"**/test/**",
					"test-utils",
					"**/__snapshots__/**",
				],
			},
		},
		{
			input: "./src/",
			format: "cjs",
			ext: "cjs",
			globOptions: {
				// test folders
				ignore: ["**/*.test.ts", "**/*.spec.ts", "**/test/**", "test-utils"],
			},
		},
	],
});
