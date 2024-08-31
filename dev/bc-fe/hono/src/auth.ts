import { betterAuth } from "better-auth";
import { organization, twoFactor } from "better-auth/plugins";
import { github } from "better-auth/social-providers";

export const auth = betterAuth({
	baseURL: "http://localhost:3000",
	basePath: "/auth",
	database: {
		provider: "sqlite",
		url: "./db.sqlite",
	},
	socialProvider: [
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
	],
	emailAndPassword: {
		enabled: true,
	},
});
