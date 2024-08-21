import { betterAuth } from "better-auth";
import { github, passkey } from "better-auth/provider";
import { organization } from "better-auth/plugins";

export const auth = betterAuth({
	basePath: "/api/auth",
	providers: [
		github({
			clientId: process.env.GITHUB_CLIENT_ID as string,
			clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
		}),
		passkey({
			rpID: "localhost",
			rpName: "Better Auth",
		}),
	],
	database: {
		provider: "sqlite",
		url: "./prisma/db.sqlite",
	},
	secret: "better-auth-secret.1234567890",
	emailAndPassword: {
		enabled: true,
	},
});
