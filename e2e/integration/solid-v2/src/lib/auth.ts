import { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";

const database = new DatabaseSync(":memory:");

export const auth = betterAuth({
	database,
	emailAndPassword: {
		enabled: true,
	},
});

const { runMigrations } = await getMigrations(auth.options);

await runMigrations();
await auth.api.signUpEmail({
	body: {
		name: "Test User",
		email: "test@test.com",
		password: "password123",
	},
});
