import { betterAuth } from "better-auth";
import { github, google } from "better-auth/provider";

export const auth = betterAuth({
	providers: [
		github({
			clientId: process.env.GITHUB_CLIENT_ID as string,
			clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
		}),
	],
	basePath: "/api/auth",
});
