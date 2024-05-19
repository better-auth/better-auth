import { prismaAdapter } from "better-auth/adapters";
import { github } from "better-auth/providers";
import { betterAuth } from "better-auth";
import { prisma } from "$lib/db";

import { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } from "$env/static/private";

export const auth = betterAuth({
	providers: [
		github({
			clientId: GITHUB_CLIENT_ID,
			clientSecret: GITHUB_CLIENT_SECRET,
		}),
	],
	adapter: prismaAdapter(prisma),
	user: {
		additionalFields: {
			firstName: {
				type: "string",
			},
			lastName: {
				type: "string",
			},
		},
	},
});

export const { handler, options } = auth;
