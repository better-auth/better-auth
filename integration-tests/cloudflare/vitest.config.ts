import {
	defineWorkersProject,
	readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";
import path from "node:path";

export default defineWorkersProject(async () => {
	const migrationsPath = path.join(__dirname, "drizzle");
	const migrations = await readD1Migrations(migrationsPath);

	return {
		test: {
			setupFiles: ["./test/apply-migrations.ts"],
			poolOptions: {
				workers: {
					singleWorker: true,
					wrangler: { configPath: "./wrangler.jsonc" },
					miniflare: {
						d1Databases: ["DB"],
						bindings: { TEST_MIGRATIONS: migrations },
					},
				},
			},
		},
	};
});
