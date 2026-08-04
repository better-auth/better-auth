import { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { nextCookies } from "better-auth/next-js";

const databasePath = process.env.BETTER_AUTH_DATABASE_PATH;
if (!databasePath) {
	throw new Error("BETTER_AUTH_DATABASE_PATH is required.");
}

export const auth = betterAuth({
	baseURL: process.env.BETTER_AUTH_URL,
	secret: "p8QL4kNZ2vW7sJ9cX5mR3tH6yB1fG0dA8uE4iK7o",
	database: new DatabaseSync(databasePath),
	emailAndPassword: {
		enabled: true,
	},
	session: {
		expiresIn: 60 * 60,
		updateAge: 0,
	},
	plugins: [nextCookies()],
});

const { runMigrations } = await getMigrations(auth.options);
await runMigrations();
