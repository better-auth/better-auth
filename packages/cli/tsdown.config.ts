import { defineConfig } from "tsdown";

export default defineConfig([
	{
		dts: { build: true },
		format: ["esm"],
		entry: ["./src/api.ts"],
		sourcemap: true,
	},
	{
		format: ["esm"],
		entry: ["./src/index.ts"],
		sourcemap: true,
	},
]);
