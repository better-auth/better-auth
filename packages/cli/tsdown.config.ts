import { defineConfig } from "tsdown";

export default defineConfig({
	format: ["esm"],
	entry: ["./src/index.ts"],
	external: ["better-auth", "better-call"],
});
