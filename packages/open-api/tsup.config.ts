import { defineConfig } from "tsup";

export default defineConfig((env) => {
	return {
		entry: ["src/index.ts"],
		format: ["esm", "cjs"],
		bundle: true,
		skipNodeModulesBundle: true,
		external: ["better-call", "better-auth"],
	};
});
