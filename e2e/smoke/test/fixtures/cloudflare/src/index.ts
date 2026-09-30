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
import { betterAuth } from "better-auth";
import { withCloudflare } from "better-auth/cloudflare";
import { getMigrations } from "better-auth/db/migration";
import { Hono } from "hono";
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

// A separate instance, so the route above still starts initialization inside
// a request.
const moduleScopeReadAuth = betterAuth(withCloudflare(cloudflareOptions));

const moduleScopeRead = moduleScopeReadAuth.$context.then(
	() => "settled",
	(error: unknown) => `rejected:${String(error)}`,
);

app.get("/_test/cloudflare/module-scope/read", async (c) =>
	c.json({ outcome: await moduleScopeRead }),
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
