import { env } from "cloudflare:workers";
import type { AuthEndpointContext } from "@better-auth/core/context";
import {
	getCurrentAdapter,
	getCurrentAuthEndpointContext,
	runWithEndpointContext,
	runWithTransaction,
} from "@better-auth/core/context";
import type {
	DBAdapter,
	DBTransactionAdapter,
} from "@better-auth/core/db/adapter";
import { createKyselyAdapter } from "@better-auth/kysely-adapter";
import { getMigrations } from "better-auth/db/migration";
import { Hono } from "hono";
import type { Kysely } from "kysely";
import { Migrator } from "kysely";
import { auth } from "./auth";

const app = new Hono();

app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/_test/session", async (c) => {
	const session = await auth.api.getSession({
		headers: c.req.raw.headers,
	});
	return c.json(session);
});

app.post("/_test/migrate", async (c) => {
	const { runMigrations } = await getMigrations(auth.options);
	await runMigrations();
	return c.body(null, 204);
});

app.get("/_test/d1-migration-lock", async (c) => {
	const { kysely } = await createKyselyAdapter({ database: env.DB });
	if (!kysely) throw new Error("D1 test database was not created");

	const suffix = crypto.randomUUID().replaceAll("-", "");
	const migrationTableName = `migration_state_${suffix}`;
	const migrationLockTableName = `migration_lock_${suffix}`;
	const targetTableName = `migration_target_${suffix}`;
	const migrationOptions = {
		db: kysely,
		migrationTableName,
		migrationLockTableName,
	};

	try {
		const initialization = await new Migrator({
			...migrationOptions,
			provider: { getMigrations: async () => ({}) },
		}).migrateToLatest();
		if (initialization.error) throw initialization.error;

		let migrationStarts = 0;
		let releaseBarrier = () => {};
		const barrier = new Promise<void>((resolve) => {
			releaseBarrier = resolve;
		});
		const timeout = setTimeout(releaseBarrier, 1500);
		try {
			const migrator = new Migrator({
				...migrationOptions,
				provider: {
					getMigrations: async () => ({
						"001_create_table": {
							async up(database: Kysely<unknown>) {
								migrationStarts++;
								if (migrationStarts === 2) releaseBarrier();
								await barrier;
								await database.schema
									.createTable(targetTableName)
									.addColumn("id", "integer")
									.execute();
							},
						},
					}),
				},
			});
			const results = await Promise.all([
				migrator.migrateToLatest(),
				migrator.migrateToLatest(),
			]);
			const recorded = await env.DB.prepare(
				`select count(*) as count from ${migrationTableName}`,
			).first<{ count: number }>();
			return c.json({
				migrationStarts,
				recorded: recorded?.count,
				errors: results.map((result) =>
					result.error ? String(result.error) : null,
				),
			});
		} finally {
			clearTimeout(timeout);
		}
	} finally {
		await kysely.destroy();
	}
});

app.get("/_test/async-context/concurrency", async (c) => {
	const contexts = Array.from(
		{ length: 32 },
		() => ({}) as AuthEndpointContext,
	);
	const currentContexts = await Promise.allSettled(
		contexts.map((context) =>
			runWithEndpointContext(context, async () => {
				await Promise.resolve();
				return getCurrentAuthEndpointContext();
			}),
		),
	);

	const adapters = Array.from({ length: 32 }, () => {
		const transactionAdapter = {} as DBTransactionAdapter;
		const adapter = {
			transaction: async <R>(
				callback: (trx: DBTransactionAdapter) => Promise<R>,
			) => callback(transactionAdapter),
		} as DBAdapter;
		return { adapter, transactionAdapter };
	});
	const currentAdapters = await Promise.allSettled(
		adapters.map(({ adapter }) =>
			runWithTransaction(adapter, async () => {
				await Promise.resolve();
				return getCurrentAdapter(adapter);
			}),
		),
	);

	return c.json({
		endpointContextMatches: currentContexts.filter(
			(currentContext, index) =>
				currentContext.status === "fulfilled" &&
				currentContext.value === contexts[index],
		).length,
		transactionAdapterMatches: currentAdapters.filter(
			(currentAdapter, index) =>
				currentAdapter.status === "fulfilled" &&
				currentAdapter.value === adapters[index]?.transactionAdapter,
		).length,
		total: contexts.length,
	});
});

export default app satisfies ExportedHandler<CloudflareBindings>;
