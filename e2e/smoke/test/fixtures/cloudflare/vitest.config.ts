import path from "node:path";
import {
	cloudflareTest,
	readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
	const migrationsPath = path.join(__dirname, "drizzle");
	const migrations = await readD1Migrations(migrationsPath);

	return {
		resolve: {
			alias: [
				{
					find: "better-call/error",
					replacement: path.resolve(
						__dirname,
						"../../../../../packages/better-auth/node_modules/better-call/dist/error.mjs",
					),
				},
				{
					find: "better-call",
					replacement: path.resolve(
						__dirname,
						"../../../../../packages/better-auth/node_modules/better-call/dist/index.mjs",
					),
				},
			],
		},
		ssr: {
			resolve: {
				conditions: ["dev-source"],
			},
		},
		plugins: [
			cloudflareTest({
				wrangler: { configPath: "./wrangler.json" },
				miniflare: {
					d1Databases: ["DB"],
					bindings: { TEST_MIGRATIONS: migrations },
				},
			}),
		],
		test: {
			setupFiles: ["./test/apply-migrations.ts"],
		},
	};
});
