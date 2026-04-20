import { defineConfig } from "tsdown";

export default defineConfig({
	dts: true,
	format: ["esm"],
	entry: ["./src/index.ts"],
	sourcemap: true,
});
