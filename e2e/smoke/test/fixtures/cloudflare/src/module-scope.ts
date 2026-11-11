import { env } from "cloudflare:workers";
import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";

const logs: string[] = [];

const options = {
	baseURL: "http://localhost:8787",
	secret: "module-scope-test-secret-at-least-32-characters",
	database: env.DB,
	logger: {
		level: "debug",
		log: (level, message) => {
			logs.push(`${level}: ${message}`);
		},
	},
} satisfies BetterAuthOptions;

// Module scope, where I/O and random values throw.
const auth = betterAuth(options);
const telemetryAuth = betterAuth({
	...options,
	baseURL: undefined,
	telemetry: { enabled: true, debug: true },
});

export default {
	async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/logs") return Response.json(logs);
		if (url.pathname === "/setup") {
			const { runMigrations } = await getMigrations(options);
			await runMigrations();
			return new Response(null, { status: 204 });
		}
		if (url.searchParams.has("telemetry")) {
			return telemetryAuth.handler(request);
		}
		return auth.handler(request);
	},
} satisfies ExportedHandler<CloudflareBindings>;
