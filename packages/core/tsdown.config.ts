import { readFile } from "node:fs/promises";
import { defineConfig } from "tsdown";

const packageJson = JSON.parse(
	await readFile(new URL("./package.json", import.meta.url), "utf-8"),
);

export default defineConfig({
	dts: { build: true, incremental: true },
	format: ["esm"],
	entry: [
		"./src/index.ts",
		"./src/db/index.ts",
		"./src/db/adapter/index.ts",
		"./src/async_hooks/index.ts",
		"./src/async_hooks/pure.index.ts",
		"./src/context/index.ts",
		"./src/env/index.ts",
		"./src/oauth2/index.ts",
		"./src/api/index.ts",
		"./src/social-providers/index.ts",
		"./src/utils/index.ts",
		"./src/error/index.ts",
	],
	external: ["@better-auth/core/async_hooks"],
	env: {
		BETTER_AUTH_VERSION: packageJson.version,
		BETTER_AUTH_TELEMETRY_ENDPOINT:
			process.env.BETTER_AUTH_TELEMETRY_ENDPOINT ?? "",
	},
	sourcemap: true,
	unbundle: true,
	clean: true,
});
