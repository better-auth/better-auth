import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { build: true, incremental: true },
	format: ["esm"],
	entry: {
		index: "./src/index.ts",
		client: "./src/client/index.ts",
		access: "./src/access/index.ts",
		"teams/client": "./src/addons/teams/client.ts",
		teams: "./src/addons/teams/index.ts",
		"dynamic-access-control/client":
			"./src/addons/dynamic-access-control/client.ts",
		"dynamic-access-control": "./src/addons/dynamic-access-control/index.ts",
	},
	external: ["better-auth", "better-call", "@better-auth/core", "defu"],
	sourcemap: true,
	treeshake: true,
});
