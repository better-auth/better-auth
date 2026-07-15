import { passkey } from "@better-auth/passkey";
import { backgrounds } from "@better-auth/ui";
import { betterAuth } from "better-auth";
import { phoneNumber, twoFactor } from "better-auth/plugins";
import { database } from "./db";
import { socialProvider } from "./utils";

const baseURL = process.env.BETTER_AUTH_URL || "http://localhost:3011";
const secret = "better-auth-ui-demo-secret-at-least-32-characters";

export const auth = betterAuth({
	emailAndPassword: { enabled: true },
	ui: {
		basePath: "/auth",
		background: backgrounds.squaredGrid,
		termsOfServiceURL: "https://example.com/terms",
		privacyPolicyURL: "https://example.com/privacy",
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
		google: socialProvider("google"),
		github: socialProvider("github"),
		apple: socialProvider("apple"),
		discord: socialProvider("discord"),
		figma: socialProvider("figma"),
		atlassian: socialProvider("atlassian"),
	},
	databaseHooks: {
		user: {
			create: {
				before: async (user) => {
					// for demo purposes, we'll set the user's role to admin
					const role = "admin";
					const data = { ...user, role };
					return { data };
				},
			},
		},
	},
	baseURL,
	secret,
	database,
});
