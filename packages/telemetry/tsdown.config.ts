import { defineConfig } from "tsdown";

export default defineConfig({
	dts: true,
	format: ["esm", "cjs"],
	entry: ["./src/index.ts"],
});
