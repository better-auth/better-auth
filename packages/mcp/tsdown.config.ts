import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { build: true, incremental: true },
	format: ["esm"],
	entry: [
		"./src/index.ts",
		"./src/client/index.ts",
		"./src/client/adapters.ts",
	],
	treeshake: true,
	clean: true,
});
