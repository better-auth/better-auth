import { betterAuth } from "better-auth";
import Database from "better-sqlite3";

export const auth = betterAuth({
	database: new Database("database.db"),
});

export type Session = typeof auth.$Infer.Session;
