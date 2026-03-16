import { defineConfig } from "tsup";

export default defineConfig({
	dts: true,
	format: ["esm"],
	entry: ["./src/index.ts", "./src/client.ts", "./src/client-resource.ts"],
	external: [
		"@better-auth/core",
		"@better-auth/utils",
		"@better-fetch/fetch",
		"better-auth",
		"better-call",
	],
	tsconfig: "../../tsconfig.build.json",
	sourcemap: true,
	treeshake: true,
	clean: true,
});
