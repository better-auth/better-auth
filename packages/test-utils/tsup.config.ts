import { defineConfig } from "tsup";

export default defineConfig({
	dts: true,
	format: ["esm"],
	entry: {
		adapter: "./src/adapter/index.ts",
	},
	tsconfig: "../../tsconfig.build.json",
	sourcemap: true,
	splitting: true,
	outDir: "./dist",
	clean: true,
});
