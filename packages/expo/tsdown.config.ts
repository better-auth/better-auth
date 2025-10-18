import { defineConfig } from "tsdown";

export default defineConfig({
	dts: true,
	format: "esm",
	unbundle: true,
	clean: true,
	entry: ["./src/index.ts", "./src/client.ts"],
	external: [
		"better-auth",
		"better-call",
		"@better-fetch/fetch",
		"react-native",
		"expo-web-browser",
		"expo-linking",
		"expo-constants",
	],
});
