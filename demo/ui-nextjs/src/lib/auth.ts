import { passkey } from "@better-auth/passkey";
import { backgrounds } from "@better-auth/ui";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { phoneNumber, twoFactor } from "better-auth/plugins";

const baseURL = process.env.BETTER_AUTH_URL || "http://localhost:3000";
const placeholderSocialProvider = {
	clientId: "placeholder",
	clientSecret: "placeholder",
};
const secret = "better-auth-ui-demo-secret-at-least-32-characters";

const database = memoryAdapter({
	user: [],
	session: [],
	account: [],
	verification: [],
	twoFactor: [],
});

export const auth = betterAuth({
	emailAndPassword: { enabled: true },
	ui: {
		basePath: "/auth",
		background: backgrounds.squaredGrid,
		theme: {
			appName: "ACME",
			logoUrl: {
				dark: "/better-auth-logo-dark.svg",
				light: "/better-auth-logo-light.svg",
			},
		},
	},
	plugins: [twoFactor(), passkey(), phoneNumber()],
	socialProviders: {
		google: placeholderSocialProvider,
		github: placeholderSocialProvider,
		apple: placeholderSocialProvider,
		discord: placeholderSocialProvider,
		figma: placeholderSocialProvider,
		atlassian: placeholderSocialProvider,
	},
	baseURL,
	secret,
	database,
	databaseHooks: {
		user: {
			create: {
				before: async (user) => {
					// for demo purposes, we'll set the user's role to admin
					return {
						data: {
							...user,
							role: "admin",
						},
					};
				},
			},
		},
	},
});
