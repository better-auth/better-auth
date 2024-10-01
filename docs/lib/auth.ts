import { betterAuth } from "better-auth";
import { organization, twoFactor } from "better-auth/plugins";

export const auth = betterAuth({
	baseURL: "http://localhost:3000",
	database: {
		provider: "sqlite",
		url: "./db.sqlite",
	},
	plugins: [
		twoFactor({
			issuer: "My App",
		}),
		organization(),
	],
});
