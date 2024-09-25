import { betterAuth } from "better-auth";
import { env } from "$env/dynamic/private";

export const auth = betterAuth({
	database: {
		provider: "sqlite",
		url: "./db.sqlite",
	},
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
