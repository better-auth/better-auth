import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { build: true, incremental: true },
	format: ["esm"],
	entry: [
		"./src/index.ts",
		"./src/db/index.ts",
		"./src/db/adapter/index.ts",
		"./src/async_hooks/index.ts",
		"./src/context/index.ts",
		"./src/env/index.ts",
		"./src/oauth2/index.ts",
		"./src/api/index.ts",
		"./src/social-providers/index.ts",
		"./src/utils/index.ts",
		"./src/error/index.ts",
	],
	clean: true,
});
