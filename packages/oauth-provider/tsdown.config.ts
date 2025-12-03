import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { build: true, incremental: true },
	format: ["esm"],
	entry: ["./src/index.ts", "./src/client.ts", "./src/client-resource.ts"],
	external: [
		"@better-auth/core",
		"@better-auth/utils",
		"@better-fetch/fetch",
		"better-auth",
		"better-call",
	],
	treeshake: true,
	clean: true,
});
