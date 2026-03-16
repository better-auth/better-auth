import { defineConfig } from "tsup";

export default defineConfig({
	dts: true,
	format: ["esm"],
	entry: ["./src/index.ts", "./src/client.ts", "./src/types.ts"],
	external: ["better-auth", "better-call", "@better-fetch/fetch"],
	tsconfig: "../../tsconfig.build.json",
	sourcemap: true,
	treeshake: true,
});
