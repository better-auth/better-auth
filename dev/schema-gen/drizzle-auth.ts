import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters";
import { db } from "./drizzle";

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
	}),
});
