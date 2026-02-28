import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { build: true },
	format: ["esm"],
	entry: ["./src/index.ts", "./src/api.ts"],
	external: ["better-auth", "better-call"],
	sourcemap: true,
});
