import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { credential, github, google } from "better-auth/providers";
import { db } from "../db";

export const auth = betterAuth({
	adapter: prismaAdapter(db),
	providers: [
		github({
			clientId: process.env.GITHUB_CLIENT_ID || "",
			clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
			linkAccounts: {
				field: "email",
				key: "email",
			},
		}),
		google({
			clientId: process.env.GOOGLE_CLIENT_ID || "",
			clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
			linkAccounts: {
				field: "email",
				key: "email",
			},
		}),
		credential(),
	],
	user: {
		fields: {
			email: {
				type: "string",
				transform: (value: string) => value.toLowerCase(),
			},
			emailVerified: {
				type: "boolean",
			},
			firstName: {
				type: "string",
			},
			lastName: {
				type: "string",
			},
			image: {
				type: "string",
				required: false,
			},
			password: {
				type: "string",
				required: false,
				returned: false,
			},
		},
	},
});
