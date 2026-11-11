import { env } from "cloudflare:workers";
import { oauthProvider } from "@better-auth/oauth-provider";
import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { jwt } from "better-auth/plugins/jwt";

const resource = "https://api.example.com";
let stallURL = "";
let holdSeed = false;

/** Holds the next `oauthResource` query on a fetch to the test's stall server. */
function heldSeedDatabase(database: D1Database): D1Database {
	function statement(
		prepared: D1PreparedStatement,
		seedQuery: boolean,
	): D1PreparedStatement {
		return new Proxy(prepared, {
			get(target, property) {
				if (property === "bind") {
					return (...values: unknown[]) =>
						statement(target.bind(...values), seedQuery);
				}
				if (property === "all") {
					return async <T>() => {
						if (seedQuery && holdSeed) {
							holdSeed = false;
							await (await fetch(`${stallURL}/seed`)).text();
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
				return (query: string) =>
					statement(target.prepare(query), query.includes('"oauthResource"'));
			}
			const value: unknown = Reflect.get(target, property, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
}

const options = {
	baseURL: "http://localhost:8787",
	secret: "plugin-retry-test-secret-at-least-32-characters",
	database: heldSeedDatabase(env.DB),
	advanced: { database: { validateSchema: false } },
	plugins: [
		genericOAuth({
			config: [
				{
					providerId: "idp",
					// Read on each attempt: the stall server's URL arrives after module scope.
					get discoveryUrl() {
						return `${stallURL}/discovery`;
					},
					clientId: "client",
					clientSecret: "secret",
				},
			],
		}),
		jwt(),
		oauthProvider({
			loginPage: "/login",
			consentPage: "/consent",
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
			resources: [resource],
			clientRegistrationDefaultResources: [resource],
			silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
		}),
	],
} satisfies BetterAuthOptions;

// Module scope, where I/O throws: startup discovery and seeding fail, so both
// are retried by later requests.
const auth = betterAuth(options);

const operations = {
	discovery: () =>
		auth.api
			.signInSocial({ body: { provider: "idp", callbackURL: "/" } })
			.then((result) => result.url),
	seed: () =>
		auth.api
			.registerOAuthClient({
				body: { redirect_uris: ["https://client.example.com/callback"] },
			})
			.then((client) => client.resources),
};

export default {
	async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/setup") {
			stallURL = url.searchParams.get("stall") ?? "";
			const { runMigrations } = await getMigrations(options);
			await runMigrations();
			return new Response(null, { status: 204 });
		}
		const op = url.searchParams.get("op");
		if (op !== "discovery" && op !== "seed") {
			return new Response("Unknown op", { status: 404 });
		}
		const operation = operations[op];
		if (url.pathname === "/start") {
			// Respond once the stall server holds this retry's I/O, so this request ends first.
			holdSeed = op === "seed";
			void operation().catch(() => {});
			await fetch(`${stallURL}/held?path=/${op}`);
			return new Response(null, { status: 204 });
		}
		return Promise.race([
			operation().then((value) => Response.json(value)),
			scheduler
				.wait(3_000)
				.then(() => new Response("Retry did not settle", { status: 504 })),
		]);
	},
} satisfies ExportedHandler<CloudflareBindings>;
