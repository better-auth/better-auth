import Database from "better-sqlite3";
import { betterAuth } from "better-auth";

export const auth = betterAuth({
	database: new Database("./db.sqlite"),
	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID || "",
			clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
		},
	},
	emailAndPassword: {
		enabled: true,
		async sendResetPassword(url, user) {
			console.log("Reset password url:", url);
		},
	},
});
