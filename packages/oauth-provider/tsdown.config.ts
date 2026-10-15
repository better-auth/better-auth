import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { build: true, incremental: true },
	format: ["esm"],
	entry: [
		"./src/index.ts",
		"./src/client.ts",
		"./src/client-resource.ts",
		"./src/internal.ts",
	],
	deps: {
		alwaysBundle: ["@better-auth/rate-limit"],
	},
	treeshake: true,
	clean: true,
});
