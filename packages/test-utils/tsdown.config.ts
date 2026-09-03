import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { build: true, incremental: true },
	format: ["esm"],
	entry: {
		adapter: "./src/adapter/index.ts",
		scim: "./src/scim-lifecycle.ts",
	},
	unbundle: true,
	outDir: "./dist",
	clean: true,
});
