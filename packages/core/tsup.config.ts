import { readFile } from "node:fs/promises";
import { defineConfig } from "tsup";

const packageJson = JSON.parse(
	await readFile(new URL("./package.json", import.meta.url), "utf-8"),
);

export default defineConfig({
	dts: true,
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
		"./src/utils/db.ts",
		"./src/utils/deprecate.ts",
		"./src/utils/error-codes.ts",
		"./src/utils/fetch-metadata.ts",
		"./src/utils/id.ts",
		"./src/utils/ip.ts",
		"./src/utils/json.ts",
		"./src/utils/string.ts",
		"./src/utils/url.ts",
		"./src/error/index.ts",
		"./src/instrumentation/index.ts",
	],
	external: ["@better-auth/core/async_hooks"],
	env: {
		BETTER_AUTH_VERSION: packageJson.version,
		BETTER_AUTH_TELEMETRY_ENDPOINT:
			process.env.BETTER_AUTH_TELEMETRY_ENDPOINT ?? "",
	},
	tsconfig: "../../tsconfig.build.json",
	sourcemap: true,
	splitting: true,
	clean: true,
});
