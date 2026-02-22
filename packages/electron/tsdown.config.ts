import { defineConfig } from "tsdown";

export default defineConfig([
	{
		dts: { build: true, incremental: true },
		format: ["esm"],
		entry: [
			"./src/index.ts",
			"./src/client.ts",
			"./src/proxy.ts",
			"./src/storage.ts",
		],
		external: ["better-auth", "better-call", "@better-fetch/fetch", "electron"],
		treeshake: true,
	},
	{
		dts: { build: true, incremental: true },
		format: ["esm"],
		entry: ["./src/preload.ts"],
		external: ["electron", "kysely"],
		noExternal: [/^@better-auth\/core/, /^better-call/],
		inlineOnly: ["better-call", "@standard-schema/spec"],
		treeshake: true,
	},
]);
