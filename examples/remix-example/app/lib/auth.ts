import { betterAuth } from "better-auth";
import Database from "better-sqlite3";
import { twoFactor, passkey } from "better-auth/plugins";

export const auth = betterAuth({
	database: new Database("./sqlite.db"),
	emailAndPassword: {
		enabled: true,
		sendEmailVerificationOnSignUp: true,
		async sendVerificationEmail() {},
		async sendResetPassword(url, user) {},
	},
	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID || "",
			clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
		},
		github: {
			clientId: process.env.GITHUB_CLIENT_ID || "",
			clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
		},
		discord: {
			clientId: process.env.DISCORD_CLIENT_ID || "",
			clientSecret: process.env.DISCORD_CLIENT_SECRET || "",
		},
	},
	plugins: [twoFactor(), passkey()],
});
