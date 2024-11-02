import * as fs from "fs";
import { defineConfig } from "tsup";

export default defineConfig((env) => {
	return {
		entry: {
			index: "./src/index.ts",
			social: "./src/social-providers/index.ts",
			types: "./src/types/index.ts",
			client: "./src/client/index.ts",
			crypto: "./src/crypto/index.ts",
			cookies: "./src/cookies/index.ts",
			"adapters/prisma": "./src/adapters/prisma-adapter/index.ts",
			"adapters/drizzle": "./src/adapters/drizzle-adapter/index.ts",
			"adapters/mongodb": "./src/adapters/mongodb-adapter/index.ts",
			"adapters/kysely": "./src/adapters/kysely-adapter/index.ts",
			db: "./src/db/index.ts",
			oauth2: "./src/oauth2/index.ts",
			react: "./src/client/react.ts",
			vue: "./src/client/vue.ts",
			svelte: "./src/client/svelte.ts",
			solid: "./src/client/solid.ts",
			plugins: "./src/plugins/index.ts",
			api: "./src/api/index.ts",
			"client/plugins": "./src/client/plugins/index.ts",
			"svelte-kit": "./src/integrations/svelte-kit.ts",
			"solid-start": "./src/integrations/solid-start.ts",
			"next-js": "./src/integrations/next-js.ts",
			node: "./src/integrations/node.ts",
		},
		format: ["esm", "cjs"],
		bundle: true,
		splitting: true,
		skipNodeModulesBundle: true,
	};
});
