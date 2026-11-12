import { env } from "cloudflare:workers";
import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";

let stallURL = "";
let holdNext = false;

/** Holds the next query on a fetch to the test's stall server once `holdNext` is set. */
function heldDatabase(database: D1Database): D1Database {
	function statement(prepared: D1PreparedStatement): D1PreparedStatement {
		return new Proxy(prepared, {
			get(target, property) {
				if (property === "bind") {
					return (...values: unknown[]) => statement(target.bind(...values));
				}
				if (property === "all") {
					return async <T>() => {
						if (holdNext) {
							holdNext = false;
							await (await fetch(`${stallURL}/query`)).text();
						}
						return target.all<T>();
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
				return (query: string) => statement(target.prepare(query));
			}
			const value: unknown = Reflect.get(target, property, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
}

const options = {
	baseURL: "http://localhost:8787",
	secret: "verification-lock-test-secret-at-least-32-characters",
	database: heldDatabase(env.DB),
	advanced: { database: { validateSchema: false } },
} satisfies BetterAuthOptions;

const auth = betterAuth(options);
const identifier = "verification-lock";

export default {
	async fetch(request) {
		const url = new URL(request.url);
		const { internalAdapter } = await auth.$context;
		if (url.pathname === "/setup") {
			stallURL = url.searchParams.get("stall") ?? "";
			const { runMigrations } = await getMigrations(options);
			await runMigrations();
			await internalAdapter.createVerificationValue({
				identifier,
				value: "consumed",
				expiresAt: new Date(Date.now() + 60_000),
			});
			return new Response(null, { status: 204 });
		}
		if (url.pathname === "/start") {
			// Respond once the stall server holds this consume's query, so this request ends first.
			holdNext = true;
			void internalAdapter.consumeVerificationValue(identifier).catch(() => {});
			await fetch(`${stallURL}/held`);
			return new Response(null, { status: 204 });
		}
		return Promise.race([
			internalAdapter
				.consumeVerificationValue(identifier)
				.then((verification) => Response.json(verification)),
			scheduler
				.wait(3_000)
				.then(() => new Response("Consume did not settle", { status: 504 })),
		]);
	},
} satisfies ExportedHandler<CloudflareBindings>;
