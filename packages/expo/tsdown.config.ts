import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { build: true, incremental: true },
	format: ["esm"],
	outExtension({ format }) {
		if (format === "esm") {
			return { js: ".mjs", dts: ".d.mts" };
		}
		return { js: ".js", dts: ".d.ts" };
	},
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
	treeshake: true,
});
