import { betterAuth } from "better-auth";
import { github } from "better-auth/social-providers";

export const auth = betterAuth({
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
});
