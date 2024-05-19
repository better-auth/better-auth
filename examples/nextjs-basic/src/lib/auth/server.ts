import { prisma } from "@/lib/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma-adapter";
import { github, google, magicLink } from "better-auth/providers";
import { getServerActions } from "better-auth/next";
import { betterOrg } from "@better-auth/organization";

export const org = betterOrg({
	organization: {
		modelName: "organization",
		additionalFields: {
			slug: { type: "string", required: true },
		},
	},
	organizationMember: {
		additionalFields: {
			name: { type: "string", required: true },
		},
	},
});

export const auth = betterAuth({
	plugins: [org],
	providers: [
		magicLink({
			async sendEmail(email, url) {
				console.log(email, url);
			},
		}),
		github({
			clientId: process.env.GITHUB_CLIENT_ID as string,
			clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
			linkAccounts: {
				field: "email",
				key: "email",
			},
		}),
		google({
			clientId: process.env.GOOGLE_CLIENT_ID as string,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
		}),
	],
	user: {
		fields: {
			name: { type: "string", required: true },
			email: { type: "string", required: true },
			emailVerified: {
				type: "boolean",
				required: true,
			},
			image: { type: "string", required: false },
		},
	},
	adapter: prismaAdapter(prisma),
});

export type Auth = typeof auth;

export const { handler, caller } = auth;
export const { signIn, getSession, createOrganization, signOut } =
	getServerActions(auth);
