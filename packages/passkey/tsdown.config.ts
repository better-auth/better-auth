import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/client.ts"],
	format: ["esm", "cjs"],
	clean: true,
	dts: true,
});
