import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { Pool } from "pg";

export const auth = betterAuth({
	database: new Pool({
		connectionString: process.env.DATABASE_URL,
	}),
	emailAndPassword: {
		enabled: true,
	},
	plugins: [expo()],
	socialProviders: {
		github: {
			clientId: process.env.GITHUB_CLIENT_ID!,
			clientSecret: process.env.GITHUB_CLIENT_SECRET!,
		},
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID!,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
		},
	},
	// Trust the app-specific scheme only. The expo() plugin adds the broad
	// `exp://` development scheme automatically when NODE_ENV is development;
	// trusting it in production could leak the session cookie to a deep link
	// the app does not control.
	trustedOrigins: ["better-auth://"],
});
