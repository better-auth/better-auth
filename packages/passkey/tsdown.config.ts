import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { build: true, incremental: true },
	format: ["esm"],
	outExtension({ format }) {
		if (format === "esm") {
			return { js: ".mjs", dts: ".d.mts" };
		}
		return { js: ".js", dts: ".d.ts" };
	},
	entry: ["./src/index.ts", "./src/client.ts"],
	external: [
		"nanostores",
		"@better-auth/utils",
		"better-call",
		"@better-fetch/fetch",
		"@better-auth/core",
		"better-auth",
	],
	treeshake: true,
});
