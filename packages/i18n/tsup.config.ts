import { defineConfig } from "tsup";

export default defineConfig({
	dts: true,
	format: ["esm"],
	entry: ["./src/index.ts", "./src/client.ts"],
	external: ["@better-auth/core", "better-auth"],
	tsconfig: "../../tsconfig.build.json",
	sourcemap: true,
	treeshake: true,
});
