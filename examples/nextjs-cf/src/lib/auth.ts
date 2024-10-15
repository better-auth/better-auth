import { betterAuth } from "better-auth";
import { magicLink, passkey } from "better-auth/plugins";
import { db } from "./db";

export const auth = betterAuth({
	database: {
		db,
		type: "sqlite",
	},
	baseURL: process.env.BETTER_AUTH_URL,
	socialProviders: {
		github: {
			clientId: process.env.GITHUB_CLIENT_ID!,
			clientSecret: process.env.GITHUB_CLIENT_SECRET!,
		},
	},
	plugins: [
		passkey(),
		magicLink({
			sendMagicLink(data) {
				console.log(data);
			},
		}),
	],
});
