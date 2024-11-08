import { defineConfig } from "tsup";

export default defineConfig((env) => {
	return {
		entry: {
			index: "src/index.ts",
			client: "src/client.ts",
		},
		format: ["esm", "cjs"],
		bundle: true,
		skipNodeModulesBundle: true,
	};
});
