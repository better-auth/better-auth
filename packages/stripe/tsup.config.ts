import { defineConfig } from "tsup";

export default defineConfig({
	dts: true,
	format: ["esm"],
	entry: ["./src/index.ts", "./src/client.ts"],
	external: ["better-auth", "better-call", "@better-fetch/fetch", "stripe"],
	tsconfig: "../../tsconfig.build.json",
	sourcemap: true,
});
