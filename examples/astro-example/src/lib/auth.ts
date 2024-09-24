import { betterAuth } from "better-auth";

export const auth = betterAuth({
	database: {
		provider: "sqlite",
		url: "./db.sqlite",
	},
	account: {
		accountLinking: {
			enabled: true,
			trustedProviders: ["google"],
		},
	},
	socialProviders: {
		google: {
			clientId: import.meta.env.GOOGLE_CLIENT_ID || "",
			clientSecret: import.meta.env.GOOGLE_CLIENT_SECRET || "",
		},
	},
});
