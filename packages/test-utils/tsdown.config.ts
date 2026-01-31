import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { build: true, incremental: true },
	format: ["esm"],
	entry: {
		adapter: "./src/adapter/index.ts",
	},
	sourcemap: true,
	unbundle: true,
	outDir: "./dist",
	clean: true,
});
