import { readFile } from "node:fs/promises";
import { defineConfig } from "tsdown";

const packageJson = JSON.parse(
	await readFile(new URL("./package.json", import.meta.url), "utf-8"),
);

export default defineConfig({
	dts: { build: true },
	format: ["esm"],
	entry: ["./src/index.ts"],
	sourcemap: "inline",
	env: {
		BETTER_AUTH_VERSION: packageJson.version,
	},
});
