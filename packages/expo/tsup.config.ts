import { defineConfig } from "tsup";

export default defineConfig({
	dts: true,
	format: ["esm"],
	entry: ["./src/index.ts", "./src/client.ts", "./src/plugins/index.ts"],
	external: [
		"better-auth",
		"better-call",
		"@better-fetch/fetch",
		"react-native",
		"expo-web-browser",
		"expo-linking",
		"expo-constants",
	],
	platform: "neutral",
	tsconfig: "../../tsconfig.build.json",
	sourcemap: true,
	treeshake: true,
});
