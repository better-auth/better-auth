import { betterAuth } from "better-auth";
import { passkey, twoFactor, rateLimiter } from "better-auth/plugins";

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
	emailAndPassword: {
		enabled: true,
	},
	socialProviders: {
		google: {
			clientId: import.meta.env.GOOGLE_CLIENT_ID || "",
			clientSecret: import.meta.env.GOOGLE_CLIENT_SECRET || "",
		},
	},
	plugins: [
		passkey(),
		twoFactor(),
		rateLimiter({
			enabled: true,
			storage: {
				provider: "memory",
			},
		}),
	],
});
