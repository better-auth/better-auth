import { DatabaseSync } from "node:sqlite";
import { sso } from "@better-auth/sso";
import { betterAuth } from "better-auth";

const databasePath = process.env.BETTER_AUTH_MIGRATION_DATABASE;
const identityProviderIssuer = process.env.BETTER_AUTH_MIGRATION_IDP_ISSUER;
if (!databasePath || !identityProviderIssuer) {
	throw new Error(
		"BETTER_AUTH_MIGRATION_DATABASE and BETTER_AUTH_MIGRATION_IDP_ISSUER are required",
	);
}

export const auth = betterAuth({
	baseURL: "http://localhost:3000",
	database: new DatabaseSync(databasePath),
	emailAndPassword: { enabled: true },
	plugins: [
		sso({
			defaultSSO: [
				{
					domain: "migration.example.com",
					oidcConfig: {
						clientId: "published-1-7-sso-client",
						clientSecret: "published-1-7-sso-secret",
						discoveryEndpoint: `${identityProviderIssuer}/.well-known/openid-configuration`,
						issuer: identityProviderIssuer,
						pkce: false,
					},
					providerId: "workforce-sso",
				},
			],
		}),
	],
	trustedOrigins: [identityProviderIssuer],
});
