import { betterAuth } from "better-auth";
import Database from "better-sqlite3";

console.log({ env: process.env })

export const auth = betterAuth({
	database: new Database("./sqlite.db"),
	socialProviders: {
		github: {
			clientId: process.env.GITHUB_CLIENT_ID as string,
			clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
		},
	},
});
