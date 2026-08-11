import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Dedicated project for exercising the adapter against drizzle-orm 1.x.
 *
 * The rest of the repo pins drizzle 0.x, so 1.x is installed under the
 * `drizzle-orm-v1` alias (see package.json devDependencies). Here we alias the
 * bare `drizzle-orm` specifier to that 1.x copy so the *adapter source* resolves
 * a single, consistent 1.x instance — matching how a real 1.x consumer app is
 * wired, and ensuring drizzle's `is(Column)` / `SQL` identity checks line up.
 */
const aliasDrizzleToV1 = [
	{ find: /^drizzle-orm$/, replacement: "drizzle-orm-v1" },
];

export default defineConfig({
	resolve: {
		alias: aliasDrizzleToV1,
		conditions: ["dev-source"],
	},
	ssr: {
		resolve: {
			alias: aliasDrizzleToV1,
			conditions: ["dev-source"],
		},
	},
	test: {
		name: "drizzle-adapter-v1",
		root: fileURLToPath(new URL(".", import.meta.url)),
		include: ["src/**/*.integration.ts"],
	},
});
