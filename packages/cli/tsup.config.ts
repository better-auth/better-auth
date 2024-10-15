import { defineConfig } from "tsup";
export default defineConfig((env) => {
	return {
		entry: ["./src/index.ts"],
		format: ["esm"],
		splitting: false,
		bundle: true,
		skipNodeModulesBundle: true,
		target: "es2022",
	};
});
