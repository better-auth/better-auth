import { DatabaseSync } from "node:sqlite";
import { oauthProvider } from "@better-auth/oauth-provider";
import { scim } from "@better-auth/scim";
import { sso } from "@better-auth/sso";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";

const databasePath = process.env.BETTER_AUTH_MIGRATION_DATABASE;
if (!databasePath)
	throw new Error("BETTER_AUTH_MIGRATION_DATABASE is required");

export const auth = betterAuth({
	baseURL: "http://localhost:3000",
	database: new DatabaseSync(databasePath),
	emailAndPassword: { enabled: true },
	plugins: [
		jwt(),
		oauthProvider({
			consentPage: "/consent",
			loginPage: "/login",
			silenceWarnings: {
				oauthAuthServerConfig: true,
				openidConfig: true,
			},
		}),
		sso(),
		scim({
			connections: [
				{
					credentials: [
						{
							id: "published-1-7-scim-token",
							token: "published-1-7-scim-token",
							type: "bearer",
						},
					],
					id: "workforce-scim",
				},
			],
		}),
	],
});
