import { DatabaseSync } from "node:sqlite";
import { oauthProvider } from "@better-auth/oauth-provider";
import { scim } from "@better-auth/scim";
import { sso } from "@better-auth/sso";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";

const databasePath = process.env.BETTER_AUTH_MIGRATION_DATABASE;
if (!databasePath)
	throw new Error("BETTER_AUTH_MIGRATION_DATABASE is required");
const scimUserId = process.env.BETTER_AUTH_MIGRATION_SCIM_USER_ID;
const identityProviderIssuer = process.env.BETTER_AUTH_MIGRATION_IDP_ISSUER;

export const auth = betterAuth({
	account: { identityStrategy: "provider-id" },
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
		sso({
			...(identityProviderIssuer && {
				defaultSSO: [
					{
						domain: "migration.example.com",
						oidcConfig: {
							clientId: "published-1-6-sso-client",
							clientSecret: "published-1-6-sso-secret",
							discoveryEndpoint: `${identityProviderIssuer}/.well-known/openid-configuration`,
							issuer: identityProviderIssuer,
							pkce: false,
						},
						providerId: "workforce-sso",
					},
				],
			}),
		}),
		scim({
			connections: [
				{
					credentials: [
						{
							id: "guided-scim-token",
							token: "guided-scim-token",
							type: "bearer",
						},
					],
					id: "workforce-scim",
				},
			],
			identity: {
				resolveUser: () =>
					scimUserId
						? { action: "link", userId: scimUserId, profile: "preserve" }
						: { action: "create" },
			},
		}),
	],
	...(identityProviderIssuer && { trustedOrigins: [identityProviderIssuer] }),
});
