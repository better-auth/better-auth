import { defineConfig } from "tsdown";

export default defineConfig([
	{
		dts: { build: true, incremental: true },
		format: ["esm"],
		entry: ["./src/index.ts"],
		treeshake: true,
	},
	{
		dts: { build: true, incremental: true },
		format: ["esm"],
		entry: ["./src/node.ts"],
		treeshake: true,
	},
]);
