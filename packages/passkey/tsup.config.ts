import { defineConfig } from "tsup";

export default defineConfig({
	dts: true,
	format: ["esm"],
	entry: ["./src/index.ts", "./src/client.ts"],
	external: [
		"nanostores",
		"@better-auth/utils",
		"better-call",
		"@better-fetch/fetch",
		"@better-auth/core",
		"better-auth",
	],
	tsconfig: "../../tsconfig.build.json",
	sourcemap: true,
	treeshake: true,
});
