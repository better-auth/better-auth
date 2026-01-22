import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { build: true, incremental: true },
	format: ["esm"],
	entry: ["./index.ts"],
	sourcemap: true,
	treeshake: true,
	clean: true,
	unbundle: true,
});
