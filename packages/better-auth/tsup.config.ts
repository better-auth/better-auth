import { exec } from "node:child_process";
import { promisify } from "node:util";
import { defineConfig } from "tsup";

const pexec = promisify(exec);

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
		"svelte-kit": "./src/integrations/svelte-kit.ts",
		svelte: "./src/client/svelte.ts",
		access: "./src/plugins/organization/access/index.ts",
		solid: "./src/client/solid.ts",
		"solid-start": "./src/integrations/solid-start.ts",
		"next-js": "./src/integrations/next-js.ts",
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
		"mysql2",
		"pg",
		"typescript",
	],
	noExternal: ["better-sqlite3"],
	target: "es2022",
});
