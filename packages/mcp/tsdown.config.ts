import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { build: true },
	format: ["esm"],
	entry: ["./src/index.ts"],
});
