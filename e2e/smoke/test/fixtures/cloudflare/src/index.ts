import type { AuthEndpointContext } from "@better-auth/core/context";
import {
	getCurrentAdapter,
	getCurrentAuthContext,
	runWithEndpointContext,
	runWithTransaction,
} from "@better-auth/core/context";
import type {
	DBAdapter,
	DBTransactionAdapter,
} from "@better-auth/core/db/adapter";
import { sso } from "@better-auth/sso";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins/jwt";
import { Hono } from "hono";
import { createDrizzle } from "./db";

const createAuth = (env: CloudflareBindings) =>
	betterAuth({
		baseURL: "http://localhost:4000",
		database: drizzleAdapter(createDrizzle(env.DB), { provider: "sqlite" }),
		emailAndPassword: {
			enabled: true,
		},
		logger: {
			level: "debug",
		},
		plugins: [jwt(), sso()],
	});

type Auth = ReturnType<typeof createAuth>;

const app = new Hono<{
	Bindings: CloudflareBindings;
	Variables: {
		auth: Auth;
	};
}>();

// Keep this before the auth middleware to test first-time async context initialization.
app.get("/async-context/concurrency", async (c) => {
	const contexts = Array.from(
		{ length: 32 },
		() => ({}) as AuthEndpointContext,
	);
	const currentContexts = await Promise.allSettled(
		contexts.map((context) =>
			runWithEndpointContext(context, async () => {
				await Promise.resolve();
				return getCurrentAuthContext();
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

app.use("*", async (c, next) => {
	const auth = createAuth(c.env);
	c.set("auth", auth);
	await next();
});

app.on(["POST", "GET"], "/api/auth/*", (c) => c.var.auth.handler(c.req.raw));

app.get("/", async (c) => {
	const session = await c.var.auth.api.getSession({
		headers: c.req.raw.headers,
	});
	if (session) return c.text("Hello " + session.user.name);
	return c.text("Not logged in");
});

export default app satisfies ExportedHandler<CloudflareBindings>;
