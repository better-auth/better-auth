import { betterAuth } from "better-auth";
import { twoFactor, organization, passkey } from "better-auth/plugins";

export const auth = betterAuth({
	database: {
		provider: "sqlite",
		url: "./prisma/sqlite.db",
	},
	plugins: [
		twoFactor({
			issuer: "my app",
		}),
		organization(),
		passkey({
			rpID: "localhost",
			rpName: "BetterAuth",
			origin: "http://localhost:3000",
		}),
	],
});
