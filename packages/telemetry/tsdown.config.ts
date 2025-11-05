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
	entry: ["./src/index.ts"],
});
