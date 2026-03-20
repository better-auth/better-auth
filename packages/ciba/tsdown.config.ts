import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { build: true, incremental: true },
	format: ["esm"],
	entry: ["./src/index.ts", "./src/client.ts"],
	external: [
		"@better-auth/core",
		"@better-auth/oauth-provider",
		"@better-auth/utils",
		"@better-fetch/fetch",
		"better-auth",
		"better-call",
	],
	sourcemap: true,
	treeshake: true,
	clean: true,
});
