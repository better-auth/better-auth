import { defineConfig } from "tsup";

export default defineConfig([
	{
		dts: true,
		format: ["esm"],
		entry: ["./src/index.ts"],
		tsconfig: "../../tsconfig.build.json",
		sourcemap: true,
	},
	{
		dts: true,
		format: ["esm"],
		entry: ["./src/node.ts"],
		tsconfig: "../../tsconfig.build.json",
		sourcemap: true,
	},
]);
