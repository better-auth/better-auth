import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { JSONWebKeySet } from "jose";
import { createLocalJWKSet, jwtVerify } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthClient } from "./types/oauth";

describe("OpenID Connect RS256 provider profile", async () => {
	const authServerOrigin = "http://localhost:3000";
	const issuer = `${authServerOrigin}/api/auth`;
	const rpBaseUrl = "http://localhost:5000";
	const providerId = "oidc-conformance";
	const redirectUri = `${rpBaseUrl}/api/auth/callback/${providerId}`;
	const state = "oidc-conformance-state";
	const nonce = "oidc-conformance-nonce";
	const scopes = ["openid", "profile", "email"];

	const { auth, signInWithTestUser, customFetchImpl, testUser } =
		await getTestInstance({
			baseURL: authServerOrigin,
			plugins: [
				jwt({
					jwks: {
						keyPairConfig: {
							alg: "RS256",
							modulusLength: 2048,
						},
					},
				}),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
				}),
			],
		});
	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: authServerOrigin,
		fetchOptions: { customFetchImpl, headers },
	});

	let oauthClient: OAuthClient | null = null;

	beforeAll(async () => {
		oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
			},
		});
		expect(oauthClient?.client_id).toBeDefined();
		expect(oauthClient?.client_secret).toBeDefined();
	});

	it("advertises the RS256 OpenID provider signing contract", async () => {
		const metadata = await auth.api.getOpenIdConfig();

		expect(metadata).toMatchObject({
			issuer,
			authorization_endpoint: `${issuer}/oauth2/authorize`,
			token_endpoint: `${issuer}/oauth2/token`,
			userinfo_endpoint: `${issuer}/oauth2/userinfo`,
			jwks_uri: `${issuer}/jwks`,
			response_types_supported: ["code"],
			response_modes_supported: ["query"],
			grant_types_supported: [
				"authorization_code",
				"client_credentials",
				"refresh_token",
			],
			code_challenge_methods_supported: ["S256"],
			subject_types_supported: ["public"],
			id_token_signing_alg_values_supported: ["RS256"],
		});
		expect(metadata.acr_values_supported).toBeUndefined();

		const jwks = await client.$fetch<JSONWebKeySet>("/jwks", {
			method: "GET",
		});
		expect(jwks.data?.keys).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					alg: "RS256",
					kty: "RSA",
				}),
			]),
		);
	});

	it("issues an RS256 ID token through the authorization-code flow", async () => {
		if (!oauthClient?.client_id || !oauthClient.client_secret) {
			throw new Error("beforeAll not run properly");
		}

		const codeVerifier = generateRandomString(32);
		const authUrl = await createAuthorizationURL({
			id: providerId,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${issuer}/oauth2/authorize`,
			state,
			scopes,
			codeVerifier,
			nonce,
		});

		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") ?? "";
			},
		});

		expect(callbackRedirectUrl).toContain(redirectUri);
		expect(callbackRedirectUrl).toContain("code=");
		const callbackUrl = new URL(callbackRedirectUrl);
		const code = callbackUrl.searchParams.get("code");
		expect(callbackUrl.origin + callbackUrl.pathname).toBe(redirectUri);
		expect(callbackUrl.searchParams.get("state")).toBe(state);
		expect(code).toBeTruthy();

		const { body, headers: tokenHeaders } = await authorizationCodeRequest({
			code: code!,
			codeVerifier,
			redirectURI: redirectUri,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
			},
		});

		let tokenResponse: Response | undefined;
		const tokens = await client.$fetch<{
			access_token?: string;
			id_token?: string;
			scope?: string;
			token_type?: string;
		}>("/oauth2/token", {
			method: "POST",
			body,
			headers: tokenHeaders,
			onResponse(context) {
				tokenResponse = context.response;
			},
		});

		expect(tokens.data?.access_token).toBeDefined();
		expect(tokens.data?.id_token).toBeDefined();
		expect(tokens.data?.scope).toBe(scopes.join(" "));
		expect(tokens.data?.token_type).toBe("Bearer");
		expect(tokenResponse?.headers.get("Cache-Control")).toBe("no-store");
		expect(tokenResponse?.headers.get("Pragma")).toBe("no-cache");

		const jwks = await client.$fetch<JSONWebKeySet>("/jwks", {
			method: "GET",
		});
		if (!jwks.data) throw new Error("Unable to fetch JWKS");
		const localJwks = createLocalJWKSet(jwks.data);
		const idToken = await jwtVerify(tokens.data!.id_token!, localJwks, {
			issuer,
			audience: oauthClient.client_id,
		});

		expect(idToken.protectedHeader.alg).toBe("RS256");
		expect(idToken.payload).toMatchObject({
			iss: issuer,
			aud: oauthClient.client_id,
			nonce,
			sub: expect.any(String),
			auth_time: expect.any(Number),
			acr: "0",
			name: testUser.name,
			email: testUser.email,
			email_verified: expect.any(Boolean),
		});
		expect(idToken.payload.at_hash).toEqual(expect.any(String));

		const userinfo = await client.$fetch<Record<string, unknown>>(
			"/oauth2/userinfo",
			{
				headers: {
					authorization: `Bearer ${tokens.data!.access_token!}`,
				},
			},
		);
		expect(userinfo.data).toMatchObject({
			sub: idToken.payload.sub,
			name: testUser.name,
			email: testUser.email,
			email_verified: expect.any(Boolean),
		});
	});
});
