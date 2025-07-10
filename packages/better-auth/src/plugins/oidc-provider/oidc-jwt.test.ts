import { afterEach, describe, expect, test } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { oidcProvider } from ".";
import { genericOAuth } from "../generic-oauth";
import type { Client } from "./types";
import { createAuthClient } from "../../client";
import { oidcClient } from "./client";
import { genericOAuthClient } from "../generic-oauth/client";
import { listen, type Listener } from "listhen";
import { toNodeHandler } from "../../integrations/node";
import { jwt } from "../jwt";
import { decodeProtectedHeader } from "jose";

describe("oidc-jwt", async () => {
	let server: Listener | null = null;
	test.each([
		{ useJwt: true, description: "with jwt plugin", expected: "EdDSA" },
		{ useJwt: false, description: "without jwt plugin", expected: "HS256" },
	])(
		"testing oidc-provider $description to return token signed with $expected",
		async ({ useJwt, description, expected }) => {
			const {
				auth: authorizationServer,
				signInWithTestUser,
				customFetchImpl,
				testUser,
			} = await getTestInstance({
				baseURL: "http://localhost:3000",
				plugins: [
					oidcProvider({
						loginPage: "/login",
						consentPage: "/oauth2/authorize",
						requirePKCE: true,
						getAdditionalUserInfoClaim(user, scopes) {
							return {
								custom: "custom value",
								userId: user.id,
							};
						},
					}),
					...(useJwt ? [jwt()] : []),
				],
			});
			const { headers } = await signInWithTestUser();
			const serverClient = createAuthClient({
				plugins: [oidcClient()],
				baseURL: "http://localhost:3000",
				fetchOptions: {
					customFetchImpl,
					headers,
				},
			});
			if (server) console.log("server is not null");
			server = await listen(toNodeHandler(authorizationServer.handler), {
				port: 3000,
			});
			let application: Client = {
				clientId: "test-client-id",
				clientSecret: "test-client-secret-oidc",
				redirectURLs: ["http://localhost:3000/api/auth/oauth2/callback/test"],
				metadata: {},
				icon: "",
				type: "web",
				disabled: false,
				name: "test",
			};
			const createdClient = await serverClient.oauth2.register({
				client_name: application.name,
				redirect_uris: application.redirectURLs,
				logo_uri: application.icon,
			});
			expect(createdClient.data).toMatchObject({
				client_id: expect.any(String),
				client_secret: expect.any(String),
				client_name: "test",
				logo_uri: "",
				redirect_uris: ["http://localhost:3000/api/auth/oauth2/callback/test"],
				grant_types: ["authorization_code"],
				response_types: ["code"],
				token_endpoint_auth_method: "client_secret_basic",
				client_id_issued_at: expect.any(Number),
				client_secret_expires_at: 0,
			});
			if (createdClient.data) {
				application = {
					clientId: createdClient.data.client_id,
					clientSecret: createdClient.data.client_secret,
					redirectURLs: createdClient.data.redirect_uris,
					metadata: {},
					icon: createdClient.data.logo_uri || "",
					type: "web",
					disabled: false,
					name: createdClient.data.client_name || "",
				};
			}

			// The RP (Relying Party) - the client application
			const { customFetchImpl: customFetchImplRP } = await getTestInstance({
				account: {
					accountLinking: {
						trustedProviders: ["test"],
					},
				},
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "test",
								clientId: application.clientId,
								clientSecret: application.clientSecret,
								authorizationUrl:
									"http://localhost:3000/api/auth/oauth2/authorize",
								tokenUrl: "http://localhost:3000/api/auth/oauth2/token",
								scopes: ["openid", "profile", "email"],
								pkce: true,
							},
						],
					}),
				],
			});

			const client = createAuthClient({
				plugins: [genericOAuthClient()],
				baseURL: "http://localhost:5000",
				fetchOptions: {
					customFetchImpl: customFetchImplRP,
				},
			});
			const data = await client.signIn.oauth2(
				{
					providerId: "test",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
				},
			);
			expect(data.url).toContain(
				"http://localhost:3000/api/auth/oauth2/authorize",
			);
			expect(data.url).toContain(`client_id=${application.clientId}`);

			let redirectURI = "";
			await serverClient.$fetch(data.url, {
				method: "GET",
				onError(context) {
					redirectURI = context.response.headers.get("Location") || "";
				},
			});
			expect(redirectURI).toContain(
				"http://localhost:3000/api/auth/oauth2/callback/test?code=",
			);
			let authToken = undefined;
			let callbackURL = "";
			await client.$fetch(redirectURI, {
				onError(context) {
					callbackURL = context.response.headers.get("Location") || "";
					authToken = context.response.headers.get("set-auth-token")!;
				},
			});
			expect(callbackURL).toContain("/dashboard");
			const accessToken = await client.getAccessToken(
				{ providerId: "test", userId: testUser.id },
				{
					auth: {
						type: "Bearer",
						token: authToken,
					},
				},
			);
			const decoded = decodeProtectedHeader(accessToken.data?.idToken!);
			expect(decoded.alg).toBe(expected);

			afterEach(async () => {
				if (server) {
					await server.close();
					server = null;
				}
			});
		},
	);
});
