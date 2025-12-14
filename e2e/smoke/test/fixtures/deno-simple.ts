import { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db";

const database = new DatabaseSync(":memory:");

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

Deno.serve(
	{
		port: 0,
		onListen: ({ port }) => {
			console.log(`Listening on http://localhost:${port}`);
		},
	},
	auth.handler,
);
