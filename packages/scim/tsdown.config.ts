import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { build: true, incremental: true },
	format: ["esm", "cjs"],
	entry: ["./src/index.ts"],
});
