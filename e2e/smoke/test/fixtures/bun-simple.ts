import Database from "bun:sqlite";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db";

const database = new Database(":memory:");

export const auth = betterAuth({
	baseURL: "http://localhost:4000",
	database,
	emailAndPassword: {
		enabled: true,
	},
	logger: {
		level: "debug",
	},
});

const { runMigrations } = await getMigrations(auth.options);

await runMigrations();

const server = Bun.serve({
	fetch: auth.handler,
	port: 0,
});

console.log(server.port);
