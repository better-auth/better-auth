import { DatabaseSync } from "node:sqlite";
import { serve } from "@hono/node-server";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { Hono } from "hono";

const database = new DatabaseSync(":memory:");

export const auth = betterAuth({
	baseURL: "http://localhost:3000",
	database,
	emailAndPassword: {
		enabled: true,
	},
	trustedOrigins: [
		"http://localhost:*", // Allow any localhost port for smoke tests
	],
	rateLimit: {
		enabled: true,
		window: 60,
		max: 3,
		ipv6Subnet: 64, // Group IPv6 addresses by /64 subnet
	},
});

const { runMigrations } = await getMigrations(auth.options);

await runMigrations();

const app = new Hono();

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

serve(
	{
		fetch: app.fetch,
		port: 0,
	},
	(info) => {
		console.log(info.port);
	},
);
