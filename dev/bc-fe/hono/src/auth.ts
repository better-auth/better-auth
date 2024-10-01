import Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import { organization, twoFactor, username } from "better-auth/plugins";

export const auth = betterAuth({
	baseURL: "http://localhost:3000",
	basePath: "/auth",
	database: new Database("./db.sqlite"),
	socialProviders: {
		github: {
			clientId: process.env.GITHUB_CLIENT_ID || "",
			clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
		},
	},
	plugins: [
		twoFactor({
			issuer: "BetterAuth",
		}),
		organization(),
		username(),
	],
	emailAndPassword: {
		enabled: true,
	},
});
