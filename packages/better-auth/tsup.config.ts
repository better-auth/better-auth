import { defineConfig } from "tsup";
export default defineConfig((env) => {
	return {
		entry: {
			index: "./src/index.ts",
			social: "./src/social-providers/index.ts",
			types: "./src/types/index.ts",
			client: "./src/client/index.ts",
			adapters: "./src/adapters/index.ts",
			cli: "./src/cli/index.ts",
			react: "./src/client/react.ts",
			vue: "./src/client/vue.ts",
			svelte: "./src/client/svelte.ts",
			solid: "./src/client/solid.ts",
			plugins: "./src/plugins/index.ts",
			api: "./src/api/index.ts",
			utils: "./src/utils/index.ts",
			"client/plugins": "./src/client/plugins/index.ts",
			"svelte-kit": "./src/integrations/svelte-kit.ts",
			access: "./src/plugins/organization/access/index.ts",
			"solid-start": "./src/integrations/solid-start.ts",
			"next-js": "./src/integrations/next-js.ts",
			node: "./src/integrations/node.ts",
		},
		format: ["esm"],
		dts: true,
		splitting: false,
		skipNodeModulesBundle: true,
		target: "es6",
	};
});
