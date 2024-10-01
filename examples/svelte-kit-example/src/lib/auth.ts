import { betterAuth } from "better-auth";
import { env } from "$env/dynamic/private";
import Database from "better-sqlite3";

export const auth = betterAuth({
	database: new Database("./db.sqlite"),
	socialProviders: {
		google: {
			clientId: env.GOOGLE_CLIENT_ID || "",
			clientSecret: env.GOOGLE_CLIENT_SECRET || "",
		},
	},
	emailAndPassword: {
		enabled: true,
		async sendResetPassword(url, user) {
			console.log("Reset password url:", url);
		},
	},
});
