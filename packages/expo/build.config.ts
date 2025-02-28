import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
	declaration: true,
	rollup: {
		emitCJS: true,
		esbuild: {
			treeShaking: true,
		},
	},
	outDir: "dist",
	clean: false,
	externals: [
		"better-auth",
		"better-call",
		"@better-fetch/fetch",
		"react-native",
		"expo-web-browser",
		"expo-linking",
		"expo-constants",
	],
	entries: ["./src/index.ts", "./src/client.ts"],
});
