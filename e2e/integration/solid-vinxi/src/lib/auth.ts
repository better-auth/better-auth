import { betterAuth } from "better-auth";
import Database from "better-sqlite3";
import { getMigrations } from "better-auth/db";

const database = new Database(":memory:");
const baseURL = process.env.BASE_URL || "http://localhost:3000";

export const auth = betterAuth({
	database,
	baseURL,
	emailAndPassword: {
		enabled: true,
	},
});

const { runMigrations } = await getMigrations(auth.options);

await runMigrations();
// Create an example user
await auth.api.signUpEmail({
	body: {
		name: "Test User",
		email: "test@test.com",
		password: "password123",
	},
});
