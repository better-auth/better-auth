import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { build: true, incremental: true },
	format: ["esm"],
	entry: ["./src/index.ts", "./src/client.ts"],
	deps: {
		neverBundle: ["@better-auth/core", "better-auth"],
	},
	sourcemap: true,
	treeshake: true,
});
