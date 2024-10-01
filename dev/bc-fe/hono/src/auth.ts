import Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import { organization, twoFactor, username } from "better-auth/plugins";
import { github } from "better-auth/social-providers";

export const auth = betterAuth({
	baseURL: "http://localhost:3000",
	basePath: "/auth",
	database: new Database("./db.sqlite"),
	socialProviders: [
		github({
			clientId: process.env.GITHUB_CLIENT_ID as string,
			clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
		}),
	],
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
