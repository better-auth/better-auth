import { defineConfig } from "tsdown";

export default defineConfig({
	dts: true,
	format: ["esm"],
	entry: ["./src/index.ts", "./src/generators/index.ts"],
	external: ["better-auth", "better-call"],
});
