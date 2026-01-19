import Database from "bun:sqlite";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";

const database = new Database(":memory:");

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

const server = Bun.serve({
	fetch: auth.handler,
	port: 0,
});

console.log(server.port);
