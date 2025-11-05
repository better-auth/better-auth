import { defineConfig } from "tsdown";

export default defineConfig({
	dts: false,
	format: ["esm"],
	entry: ["./src/index.ts"],
	external: ["better-auth", "better-call"],
});
