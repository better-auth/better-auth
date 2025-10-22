import { betterAuth } from "better-auth";

export const auth = betterAuth({
	baseURL: process.env.BETTER_AUTH_URL,
	secret: process.env.BETTER_AUTH_SECRET,

	socialProviders: {
		github: {
			clientId: process.env.GITHUB_CLIENT_ID as string,
			clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
		},
	},

	session: {
		cookieCache: {
			enabled: true,
		},
	},

	advanced: {
		oauthConfig: {
			storeStateStrategy: "cookie",
		},
	},
});
