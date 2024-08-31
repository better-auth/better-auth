import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		index: "./src/index.ts",
		social: "./src/social-providers/index.ts",
		types: "./src/types/index.ts",
		client: "./src/client/index.ts",
		cli: "./src/cli/index.ts",
		react: "./src/client/react.ts",
		preact: "./src/client/preact.ts",
		vue: "./src/client/vue.ts",
		plugins: "./src/plugins/index.ts",
		"client/plugins": "./src/client/plugins.ts",
	},
	splitting: false,
	sourcemap: true,
	format: ["esm"],
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
	noExternal: ["type-fest"],
});
