import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { build: true, incremental: true },
	format: ["esm"],
	entry: {
		index: "./src/index.ts",
		client: "./src/client/index.ts",
		access: "./src/access/index.ts",
	},
	external: ["better-auth", "better-call", "@better-auth/core"],
	sourcemap: true,
});
