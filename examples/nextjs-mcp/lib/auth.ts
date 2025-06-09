import { betterAuth } from "better-auth";
import { mcp } from "better-auth/plugins";
import Database from "better-sqlite3";

export const auth = betterAuth({
	database: new Database("./auth.db"),
	baseURL: "http://localhost:3000",
	plugins: [
		mcp({
			loginPage: "/login",
		}),
	],
	emailAndPassword: {
		enabled: true,
	},
});
