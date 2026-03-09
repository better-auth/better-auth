import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { build: true, incremental: true },
	format: ["esm"],
	entry: ["./src/index.ts", "./src/client.ts", "./src/types.ts"],
	deps: {
		neverBundle: ["better-auth", "better-call", "@better-fetch/fetch"],
	},
	sourcemap: true,
	treeshake: true,
});
