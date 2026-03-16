import { defineConfig } from "tsup";

export default defineConfig([
	{
		dts: true,
		format: ["esm"],
		entry: [
			"./src/index.ts",
			"./src/client.ts",
			"./src/proxy.ts",
			"./src/storage.ts",
		],
		external: ["better-auth", "better-call", "@better-fetch/fetch", "electron"],
		tsconfig: "../../tsconfig.build.json",
		treeshake: true,
	},
	{
		dts: true,
		format: ["esm"],
		entry: ["./src/preload.ts"],
		noExternal: [/^@better-auth\/core/, /^better-call/],
		tsconfig: "../../tsconfig.build.json",
		treeshake: true,
	},
]);
