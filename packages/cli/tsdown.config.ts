import { defineConfig } from "tsdown";

export default defineConfig({
	dts: true,
	format: "esm",
	unbundle: true,
	clean: true,
	entry: ["./src/index.ts"],
	external: ["better-auth", "better-call"],
});
