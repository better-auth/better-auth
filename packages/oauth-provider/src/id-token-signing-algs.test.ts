import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { decodeProtectedHeader } from "jose";
import { describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";

/**
 * @see https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderMetadata
 */
describe("id_token_signing_alg_values_supported with mixed signing keys", async () => {
	const authServerOrigin = "http://localhost:3000";
	const issuer = `${authServerOrigin}/api/auth`;
	const redirectUri = "http://localhost:5000/api/auth/callback/mixed-keys";

	const pinnedResource = "https://payments.example.com";

	const { auth, client, signInWithTestUser } = await getTestInstance(
		{
			baseURL: authServerOrigin,
			plugins: [
				jwt({
					jwks: {
						keyPairConfig: { alg: "RS256", modulusLength: 2048 },
						keyPairConfigs: [{ alg: "ES256" }],
					},
				}),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					scopes: ["openid", "read"],
					clientPrivileges: () => true,
					resources: [
						{ identifier: pinnedResource, signingAlgorithm: "ES256" },
					],
					enforcePerClientResources: false,
				}),
			],
		},
		{ clientOptions: { plugins: [oauthProviderClient()] } },
	);
	const { headers } = await signInWithTestUser();

	it("advertises only the primary algorithm, and ID tokens use it", async () => {
		const metadata = await auth.api.getOpenIdConfig();
		expect(metadata.id_token_signing_alg_values_supported).toEqual(["RS256"]);

		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
				token_endpoint_auth_method: "client_secret_post",
				skip_consent: true,
				grant_types: ["authorization_code", "client_credentials"],
				client_credentials_scopes: ["read"],
				scope: "openid read",
			},
		});
		if (!oauthClient.client_id || !oauthClient.client_secret) {
			throw new Error("client was not created");
		}
		const options = {
			clientId: oauthClient.client_id,
			clientSecret: oauthClient.client_secret,
			redirectURI: redirectUri,
		};

		// Mint a token with the pinned resource first, so an ES256 key exists
		// (and is the newest key) before the ID token is signed.
		const pinnedToken = await client.$fetch<{ access_token?: string }>(
			"/oauth2/token",
			{
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "client_credentials",
					client_id: oauthClient.client_id,
					client_secret: oauthClient.client_secret,
					scope: "read",
					resource: pinnedResource,
				}).toString(),
			},
		);
		expect(decodeProtectedHeader(pinnedToken.data!.access_token!).alg).toBe(
			"ES256",
		);

		const codeVerifier = generateRandomString(32);
		const authUrl = await createAuthorizationURL({
			id: "mixed-keys",
			options,
			redirectURI: "",
			authorizationEndpoint: `${issuer}/oauth2/authorize`,
			state: "mixed-keys-state",
			scopes: ["openid"],
			codeVerifier,
		});
		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			headers,
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") ?? "";
			},
		});
		const code = new URL(callbackRedirectUrl).searchParams.get("code");
		expect(code).toBeTruthy();

		const { body, headers: tokenHeaders } = await authorizationCodeRequest({
			code: code!,
			codeVerifier,
			redirectURI: redirectUri,
			options,
		});
		const tokens = await client.$fetch<{ id_token?: string }>("/oauth2/token", {
			method: "POST",
			body,
			headers: tokenHeaders,
		});

		const idTokenAlg = decodeProtectedHeader(tokens.data!.id_token!).alg;
		expect(idTokenAlg).toBe("RS256");
		expect(metadata.id_token_signing_alg_values_supported).not.toContain(
			"ES256",
		);
		expect(metadata.id_token_signing_alg_values_supported).toContain(
			idTokenAlg,
		);
	});
});
