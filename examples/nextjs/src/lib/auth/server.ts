import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { github } from "better-auth/providers";

export const auth = betterAuth({
	adapter: prismaAdapter({}),
	providers: [
		github({
			clientId: "",
			clientSecret: "",
		}),
	],
	user: {
		fields: {
			email: {
				type: "string",
			},
			name: {
				type: "string",
			},
			image: {
				type: "string",
			},
		},
	},
});
