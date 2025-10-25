import { betterAuth } from "better-auth";

const baseURL: string | undefined =
	process.env.VERCEL === "1"
		? process.env.VERCEL_ENV === "production"
			? process.env.BETTER_AUTH_URL
			: process.env.VERCEL_ENV === "preview"
				? `https://${process.env.VERCEL_URL}`
				: undefined
		: undefined;

export const auth = betterAuth({
	baseURL,
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
