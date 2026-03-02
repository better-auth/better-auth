import { readFile } from "node:fs/promises";
import { defineConfig } from "tsdown";

const packageJson = JSON.parse(
	await readFile(new URL("./package.json", import.meta.url), "utf-8"),
);

const entry = [
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
	"./src/utils/*.ts",
	"!./src/utils/*.test.ts",
	"./src/error/index.ts",
];

const env = {
	BETTER_AUTH_VERSION: packageJson.version,
	BETTER_AUTH_TELEMETRY_ENDPOINT:
		process.env.BETTER_AUTH_TELEMETRY_ENDPOINT ?? "",
};

export default defineConfig([
	{
		dts: { enabled: false },
		format: ["esm"],
		entry,
		deps: {
			neverBundle: ["@better-auth/core/async_hooks"],
		},
		env,
		sourcemap: true,
		unbundle: true,
		clean: true,
	},
	{
		dts: { build: true, incremental: true },
		entry,
		deps: {
			alwaysBundle: ["zod"],
			neverBundle: ["@better-auth/core/async_hooks"],
		},
		env,
	},
]);
