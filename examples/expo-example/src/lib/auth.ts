import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { Pool } from "pg";

export const auth = betterAuth({
	database: new Pool({
		connectionString: "postgresql://user:password@localhost:5432/better_auth",
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
	},
});
