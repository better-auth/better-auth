import { betterAuth } from "better-auth";
import { Pool } from "pg";

// A minimal Better Auth server config backed by PostgreSQL (via the built-in
// Kysely adapter). The Pool reads DATABASE_URL, so the same image works against
// any Postgres instance.
export const auth = betterAuth({
	database: new Pool({ connectionString: process.env.DATABASE_URL }),
	baseURL: process.env.BETTER_AUTH_URL,
	secret: process.env.BETTER_AUTH_SECRET,
	emailAndPassword: { enabled: true },
});
