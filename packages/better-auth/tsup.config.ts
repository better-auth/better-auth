import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		index: "./src/index.ts",
		provider: "./src/providers/index.ts",
		types: "./src/types/index.ts",
		client: "./src/client/index.ts",
		cli: "./src/cli/index.ts",
		react: "./src/client/react.ts",
		preact: "./src/client/preact.ts",
		vue: "./src/client/vue.ts",
		plugins: "./src/plugins/index.ts",
	},
	splitting: false,
	sourcemap: true,
	format: ["esm", "cjs"],
	dts: true,
	external: [
		"react",
		"svelte",
		"solid-js",
		"$app/environment",
		"next",
		"pg",
		"mysql",
		"better-sqlite3",
		"typescript",
	],
});
