import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { build: true, incremental: true },
	format: ["esm"],
	entry: ["./src/index.ts"],
	deps: {
		neverBundle: ["better-call"],
	},
	platform: "neutral",
	treeshake: true,
});
