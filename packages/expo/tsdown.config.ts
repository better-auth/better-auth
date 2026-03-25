import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { build: true, incremental: true },
	format: ["esm"],
	entry: ["./src/index.ts", "./src/client.ts", "./src/plugins/index.ts"],
	deps: {
		neverBundle: [
			"better-auth",
			"better-call",
			"@better-fetch/fetch",
			"react-native",
			"expo-web-browser",
			"expo-linking",
			"expo-constants",
		],
	},
	platform: "neutral",
	sourcemap: true,
	treeshake: true,
});
