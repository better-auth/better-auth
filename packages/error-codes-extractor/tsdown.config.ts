import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { build: true },
	format: ["esm"],
	entry: ["./src/index.ts"],
	external: ["typescript", "rolldown"],
	sourcemap: true,
	treeshake: true,
	clean: true,
});
