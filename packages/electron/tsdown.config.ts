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
		treeshake: true,
	},
	{
		dts: false,
		format: ["esm"],
		entry: ["./src/preload.ts"],
		deps: {
			alwaysBundle: [/^@better-auth\/core(?:\/|$)/, /^better-call(?:\/|$)/],
			onlyBundle: ["better-call"],
		},
		treeshake: true,
	},
	{
		dts: { build: true, incremental: false, emitDtsOnly: true },
		format: ["esm"],
		entry: ["./src/preload.ts"],
		deps: { skipNodeModulesBundle: true },
		treeshake: true,
	},
]);
