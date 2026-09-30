import { env } from "cloudflare:workers";
import type { BetterAuthOptions } from "@better-auth/core";
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
import { betterAuth } from "better-auth";
import { withCloudflare } from "better-auth/cloudflare";
import { getMigrations } from "better-auth/db/migration";
import { Hono } from "hono";
import { auth } from "./auth";

const app = new Hono();

let slowQueryStarted = false;
let releaseSlowQuery = false;
const delayedDatabase = {
	prepare(query: string) {
		const statement = env.DB.prepare(query);
		return {
			bind(...parameters: unknown[]) {
				const bound = statement.bind(...parameters);
				return {
					async all() {
						if (query.includes("slow_marker")) {
							slowQueryStarted = true;
							try {
								while (!releaseSlowQuery) {
									await new Promise((resolve) => setTimeout(resolve, 10));
								}
							} finally {
								slowQueryStarted = false;
								releaseSlowQuery = false;
							}
						}
						return bound.all();
					},
				};
			},
		};
	},
	batch: (...statements: D1PreparedStatement[]) => env.DB.batch(statements),
	exec: (query: string) => env.DB.exec(query),
} as unknown as D1Database;
const { kysely: concurrencyDatabase } = await createKyselyAdapter({
	database: delayedDatabase,
});
if (!concurrencyDatabase) throw new Error("D1 test database was not created");

app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/_test/session", async (c) => {
	const session = await auth.api.getSession({
		headers: c.req.raw.headers,
	});
	return c.json(session);
});

app.get("/_test/d1-concurrency/:query", async (c) => {
	if (c.req.param("query") === "status") {
		return c.json({ slowQueryStarted });
	}
	if (c.req.param("query") === "release") {
		releaseSlowQuery = true;
		return c.body(null, 204);
	}

	const slow = c.req.param("query") === "slow";
	const query = concurrencyDatabase.selectFrom("sqlite_master");
	await (slow
		? query.select("name as slow_marker")
		: query.select("name as fast_marker")
	)
		.limit(1)
		.execute();
	return c.body(null, 204);
});

app.post("/_test/migrate", async (c) => {
	const { runMigrations } = await getMigrations(auth.options);
	await runMigrations();
	return c.body(null, 204);
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

/**
 * Settling within this budget shows the runtime kept a promise alive. The
 * library bounds a dropped promise at 30 seconds, well past it.
 */
const SETTLE_BUDGET_MS = 5_000;

const settlesInBudget = (promise: Promise<unknown>) =>
	Promise.race([
		promise.then(
			() => "settled",
			(error: unknown) => `rejected:${String(error)}`,
		),
		new Promise<string>((resolve) => {
			setTimeout(() => resolve("hung"), SETTLE_BUDGET_MS);
		}),
	]);

const cloudflareOptions = {
	baseURL: "http://localhost:4000",
	database: env.DB,
	emailAndPassword: { enabled: true },
} satisfies BetterAuthOptions;

const moduleScopeAuth = betterAuth(withCloudflare(cloudflareOptions));

app.get("/_test/cloudflare/module-scope", async (c) =>
	c.json({ outcome: await settlesInBudget(moduleScopeAuth.$context) }),
);

const slowInitOptions = {
	...cloudflareOptions,
	plugins: [
		{
			id: "slow-init",
			init: async () => {
				await env.DB.prepare("select 1").first();
				await new Promise<void>((resolve) => {
					setTimeout(resolve, 1_500);
				});
			},
		},
	],
} satisfies BetterAuthOptions;

let slowInitAuth:
	| ReturnType<typeof betterAuth<typeof slowInitOptions>>
	| undefined;

/** Responds while initialization is still pending. */
app.get("/_test/cloudflare/init/start", (c) => {
	slowInitAuth ??= betterAuth(withCloudflare(slowInitOptions));
	void slowInitAuth.$context.catch(() => undefined);
	return c.body(null, 204);
});

app.get("/_test/cloudflare/init/join", async (c) =>
	c.json({
		outcome: slowInitAuth
			? await settlesInBudget(slowInitAuth.$context)
			: "no-instance",
	}),
);

const schemaCheckOptions = {
	...cloudflareOptions,
	disabledPaths: ["/ok"],
} satisfies BetterAuthOptions;

let schemaCheckAuth:
	| ReturnType<typeof betterAuth<typeof schemaCheckOptions>>
	| undefined;

/** Responds with a 404 without waiting for the schema check. */
app.get("/_test/cloudflare/schema-check/start", async (c) => {
	schemaCheckAuth ??= betterAuth(withCloudflare(schemaCheckOptions));
	await schemaCheckAuth.$context;
	const response = await schemaCheckAuth.handler(
		new Request("http://localhost:4000/api/auth/ok"),
	);
	return c.body(null, response.status === 404 ? 204 : 500);
});

app.get("/_test/cloudflare/schema-check/join", async (c) => {
	const ctx = await schemaCheckAuth?.$context;
	if (!ctx?.checkSchema) return c.json({ outcome: "no-check" });
	const pending = ctx.checkSchema();
	return c.json({
		outcome: pending ? await settlesInBudget(pending) : "settled",
	});
});

export default app satisfies ExportedHandler<CloudflareBindings>;
