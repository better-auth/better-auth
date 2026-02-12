import { defineConfig } from "tsdown";

export default defineConfig([
	{
		dts: { build: true, incremental: true },
		format: ["esm"],
		entry: [
			"./src/index.ts",
			"./src/client.ts",
			"./src/proxy.ts",
			"./src/preload.ts",
			"./src/storage.ts",
		],
		external: ["better-auth", "better-call", "@better-fetch/fetch", "electron"],
		treeshake: true,
	},
	{
		entry: { "preload.bundle": "./src/preload.ts" },
		format: ["cjs"],
		external: ["electron"],
		noExternal: [/^@better-auth\/core/, /^better-call/],
		inlineOnly: false,
		dts: false,
		treeshake: true,
	},
]);
