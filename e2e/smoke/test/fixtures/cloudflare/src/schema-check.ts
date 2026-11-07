import type { Auth, BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";

const options = {
	baseURL: "http://localhost:4000",
	secret: "schema-check-test-secret-at-least-32-characters",
	emailAndPassword: { enabled: true },
};

let auth: Auth<BetterAuthOptions> | undefined;
let instance: string | undefined;
let delayEnabled = false;
let queriesStarted = 0;
let queriesCompleted = 0;
let schemaLookups = 0;

function delayedDatabase(database: D1Database, delay: number): D1Database {
	function statement(
		prepared: D1PreparedStatement,
		schemaQuery: boolean,
	): D1PreparedStatement {
		return new Proxy(prepared, {
			get(target, property) {
				if (property === "bind") {
					return (...values: unknown[]) =>
						statement(target.bind(...values), schemaQuery);
				}
				if (property === "all") {
					return async <T>() => {
						queriesStarted++;
						if (schemaQuery) schemaLookups++;
						if (delayEnabled && delay > 0) await scheduler.wait(delay);
						const result = await target.all<T>();
						queriesCompleted++;
						return result;
					};
				}
				const value: unknown = Reflect.get(target, property, target);
				return typeof value === "function" ? value.bind(target) : value;
			},
		});
	}
	return new Proxy(database, {
		get(target, property) {
			if (property === "prepare") {
				return (query: string) =>
					statement(
						target.prepare(query),
						/sqlite_master|sqlite_schema/.test(query),
					);
			}
			const value: unknown = Reflect.get(target, property, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
}

export default {
	async fetch(request, env, context) {
		instance ??= crypto.randomUUID();
		const url = new URL(request.url);
		if (url.pathname === "/setup") {
			const database = env.DB;
			const { runMigrations } = await getMigrations({ ...options, database });
			await runMigrations();
			const seedAuth = betterAuth({
				...options,
				database,
				advanced: { database: { validateSchema: false } },
			});
			const result = await seedAuth.api.signUpEmail({
				body: {
					email: "schema@example.com",
					name: "Schema Test",
					password: "schema-validation-password",
				},
				returnHeaders: true,
			});
			return Response.json({
				cookie: result.headers.get("set-cookie")?.split(";")[0],
			});
		}
		if (url.pathname === "/start") {
			delayEnabled = true;
			const authOptions: BetterAuthOptions = {
				...options,
				database: delayedDatabase(
					env.DB,
					Number(url.searchParams.get("delay")),
				),
			};
			auth = betterAuth(authOptions);
			const initialized = await auth.$context;
			while (queriesStarted === 0) await scheduler.wait(0);
			if (url.searchParams.get("waitUntil") === "true") {
				const check = initialized.checkSchema?.();
				if (check) context.waitUntil(check);
			}
			return Response.json({
				instance,
				queriesStarted,
				queriesCompleted,
				schemaLookups,
			});
		}
		if (url.pathname === "/status") {
			return Response.json({
				instance,
				queriesStarted,
				queriesCompleted,
				schemaLookups,
			});
		}
		if (!auth) return new Response("Missing auth instance", { status: 409 });
		delayEnabled = false;
		if (url.pathname === "/migrate") {
			await env.DB.prepare("DROP TABLE verification").run();
			const { runMigrations } = await getMigrations(auth.options);
			await runMigrations();
			return new Response(null, { status: 204 });
		}
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				url.searchParams.get("http") === "true"
					? auth.handler(
							new Request(`${options.baseURL}/api/auth/get-session`, {
								headers: request.headers,
							}),
						)
					: auth.api
							.getSession({ headers: request.headers })
							.then((session) => Response.json(session)),
				new Promise<Response>((resolve) => {
					timer = setTimeout(
						() =>
							resolve(
								new Response("Schema check did not settle", { status: 504 }),
							),
						1_000,
					);
				}),
			]);
		} finally {
			clearTimeout(timer);
		}
	},
} satisfies ExportedHandler<CloudflareBindings>;
