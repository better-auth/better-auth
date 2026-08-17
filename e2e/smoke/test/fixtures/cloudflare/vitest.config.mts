// @cloudflare/vitest-pool-workers is ESM-only.
// Keep this config as `.mts`.

import path from "node:path";
import {
	cloudflareTest,
	readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest(async () => {
			const migrationsPath = path.join(__dirname, "drizzle");
			const migrations = await readD1Migrations(migrationsPath);
			return {
				wrangler: { configPath: "./wrangler.json" },
				miniflare: {
					d1Databases: ["DB"],
					bindings: { TEST_MIGRATIONS: migrations },
				},
			};
		}),
	],
	test: {
		setupFiles: ["./test/apply-migrations.ts"],
	},
});
