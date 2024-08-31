import { env } from "$env/dynamic/private";
import { betterAuth } from "better-auth";
import { github } from "better-auth/social-providers";

export const auth = betterAuth({
	database: {
		provider: "sqlite",
		url: "./db.sqlite",
	},
	socialProvider: [
		github({
			clientId: env.GITHUB_CLIENT_ID,
			clientSecret: env.GITHUB_CLIENT_SECRET,
		}),
	],
});
