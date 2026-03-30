import { createAuthClient } from "better-auth/client";
import { jwtClient } from "better-auth/client/plugins";
import { generateRandomString } from "better-auth/crypto";
import { createAuthorizationURL } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthClient } from "./types/oauth";

describe("private_key_jwt authentication", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const tokenEndpoint = `${authServerBaseUrl}/api/auth/oauth2/token`;
	const introspectEndpoint = `${authServerBaseUrl}/api/auth/oauth2/introspect`;
	const revokeEndpoint = `${authServerBaseUrl}/api/auth/oauth2/revoke`;
	const redirectUri = `${rpBaseUrl}/callback`;

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		trustedOrigins: ["https://trusted.example.com"],
		plugins: [
			jwt({ jwt: { issuer: authServerBaseUrl } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				assertionMaxLifetime: 300,
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
		],
	});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient(), jwtClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: { customFetchImpl, headers },
	});

	let assertionClient: OAuthClient;
	let jwksUriClient: OAuthClient;
	let secretClient: OAuthClient;
	let rsaPrivateKey: CryptoKey;
	let rsaPublicJwk: JsonWebKey;

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	beforeAll(async () => {
		// Generate RSA key pair for testing
		const keyPair = await generateKeyPair("RS256", { extractable: true });
		rsaPrivateKey = keyPair.privateKey as CryptoKey;
		rsaPublicJwk = await exportJWK(keyPair.publicKey);

		// Register a private_key_jwt client
		assertionClient = (await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
				token_endpoint_auth_method: "private_key_jwt",
				jwks: [
					{ ...rsaPublicJwk, kid: "test-key-1", alg: "RS256", use: "sig" },
				],
			},
		}))!;
		expect(assertionClient.client_id).toBeDefined();
		// private_key_jwt clients should NOT get a client_secret
		expect(assertionClient.client_secret).toBeUndefined();

		jwksUriClient = (await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
				token_endpoint_auth_method: "private_key_jwt",
				jwks_uri: "https://trusted.example.com/.well-known/jwks.json",
			},
		}))!;
		expect(jwksUriClient.client_id).toBeDefined();
		expect(jwksUriClient.client_secret).toBeUndefined();

		// Register a normal client_secret_post client for auth method enforcement test
		secretClient = (await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
			},
		}))!;
		expect(secretClient.client_secret).toBeDefined();
	});

	async function signAssertion(overrides?: {
		clientId?: string;
		aud?: string;
		exp?: number;
		jti?: string;
		kid?: string;
		key?: CryptoKey;
		omitJti?: boolean;
	}) {
		const cid = overrides?.clientId ?? assertionClient.client_id;
		const now = Math.floor(Date.now() / 1000);
		const builder = new SignJWT({})
			.setProtectedHeader({
				alg: "RS256",
				kid: overrides?.kid ?? "test-key-1",
			})
			.setIssuer(cid)
			.setSubject(cid)
			.setAudience(overrides?.aud ?? tokenEndpoint)
			.setIssuedAt(now)
			.setExpirationTime(overrides?.exp ?? now + 120);

		if (!overrides?.omitJti) {
			builder.setJti(overrides?.jti ?? crypto.randomUUID());
		}

		return builder.sign(overrides?.key ?? rsaPrivateKey);
	}

	async function getAuthCode(
		clientId: string,
		codeVerifier: string,
		scopes = ["openid", "profile"],
	) {
		const authUrl = await createAuthorizationURL({
			id: "test",
			options: { clientId, redirectURI: redirectUri },
			redirectURI: "",
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
			state: "test-state",
			scopes,
			codeVerifier,
		});

		let callbackUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(ctx) {
				callbackUrl = ctx.response.headers.get("Location") || "";
			},
		});

		return new URL(callbackUrl).searchParams.get("code")!;
	}

	async function exchangeCodeForTokens({
		clientId = assertionClient.client_id,
		code,
		codeVerifier,
		assertion,
	}: {
		clientId?: string;
		code: string;
		codeVerifier: string;
		assertion: string;
	}) {
		return client.$fetch<{
			access_token?: string;
			refresh_token?: string;
			token_type?: string;
		}>("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
				client_id: clientId,
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: assertion,
				code_verifier: codeVerifier,
			}),
			headers: {
				"content-type": "application/x-www-form-urlencoded",
			},
		});
	}

	it("should exchange code with valid private_key_jwt assertion", async () => {
		const codeVerifier = generateRandomString(32);
		const code = await getAuthCode(assertionClient.client_id, codeVerifier);
		const assertion = await signAssertion();

		const tokens = await exchangeCodeForTokens({
			code,
			codeVerifier,
			assertion,
		});

		expect(tokens.data?.access_token).toBeDefined();
		expect(tokens.data?.token_type).toBe("Bearer");
	});

	it("should exchange code using a trusted jwks_uri", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						keys: [
							{
								...rsaPublicJwk,
								kid: "trusted-jwks-key",
								alg: "RS256",
								use: "sig",
							},
						],
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
			),
		);

		const codeVerifier = generateRandomString(32);
		const code = await getAuthCode(jwksUriClient.client_id, codeVerifier);
		const assertion = await signAssertion({
			clientId: jwksUriClient.client_id,
			kid: "trusted-jwks-key",
		});

		const tokens = await exchangeCodeForTokens({
			clientId: jwksUriClient.client_id,
			code,
			codeVerifier,
			assertion,
		});

		expect(tokens.data?.access_token).toBeDefined();
		expect(globalThis.fetch).toHaveBeenCalledWith(
			"https://trusted.example.com/.well-known/jwks.json",
			expect.objectContaining({
				headers: { accept: "application/json" },
				redirect: "error",
			}),
		);
	});

	it("should reject assertion signed with wrong key", async () => {
		const wrongKeyPair = await generateKeyPair("RS256", {
			extractable: true,
		});
		const codeVerifier = generateRandomString(32);
		const code = await getAuthCode(assertionClient.client_id, codeVerifier);
		const assertion = await signAssertion({
			key: wrongKeyPair.privateKey as CryptoKey,
		});

		const result = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
				client_id: assertionClient.client_id,
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: assertion,
				code_verifier: codeVerifier,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});

		expect(result.error?.status).toBeGreaterThanOrEqual(400);
	});

	it("should reject expired assertion", async () => {
		const now = Math.floor(Date.now() / 1000);
		const codeVerifier = generateRandomString(32);
		const code = await getAuthCode(assertionClient.client_id, codeVerifier);
		const assertion = await signAssertion({ exp: now - 60 });

		const result = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
				client_id: assertionClient.client_id,
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: assertion,
				code_verifier: codeVerifier,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});

		expect(result.error?.status).toBeGreaterThanOrEqual(400);
	});

	it("should reject assertion with exp too far in the future", async () => {
		const now = Math.floor(Date.now() / 1000);
		const codeVerifier = generateRandomString(32);
		const code = await getAuthCode(assertionClient.client_id, codeVerifier);
		// exp is 1 hour out — exceeds assertionMaxLifetime of 300s
		const assertion = await signAssertion({ exp: now + 3600 });

		const result = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
				client_id: assertionClient.client_id,
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: assertion,
				code_verifier: codeVerifier,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});

		expect(result.error?.status).toBeGreaterThanOrEqual(400);
	});

	it("should reject assertion without jti", async () => {
		const codeVerifier = generateRandomString(32);
		const code = await getAuthCode(assertionClient.client_id, codeVerifier);
		const assertion = await signAssertion({ omitJti: true });

		const result = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
				client_id: assertionClient.client_id,
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: assertion,
				code_verifier: codeVerifier,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});

		expect(result.error?.status).toBeGreaterThanOrEqual(400);
	});

	it("should reject reused jti (replay prevention)", async () => {
		const jti = crypto.randomUUID();

		// First request should succeed
		const cv1 = generateRandomString(32);
		const code1 = await getAuthCode(assertionClient.client_id, cv1);
		const assertion1 = await signAssertion({ jti });

		const result1 = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code: code1,
				redirect_uri: redirectUri,
				client_id: assertionClient.client_id,
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: assertion1,
				code_verifier: cv1,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});
		expect(result1.data?.access_token).toBeDefined();

		// Second request with same jti should fail
		const cv2 = generateRandomString(32);
		const code2 = await getAuthCode(assertionClient.client_id, cv2);
		const assertion2 = await signAssertion({ jti });

		const result2 = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code: code2,
				redirect_uri: redirectUri,
				client_id: assertionClient.client_id,
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: assertion2,
				code_verifier: cv2,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});

		expect(result2.error?.status).toBeGreaterThanOrEqual(400);
	});

	it("should reject concurrent reuse of the same jti", async () => {
		const jti = crypto.randomUUID();
		const cv1 = generateRandomString(32);
		const cv2 = generateRandomString(32);
		const [code1, code2] = await Promise.all([
			getAuthCode(assertionClient.client_id, cv1),
			getAuthCode(assertionClient.client_id, cv2),
		]);
		const assertion = await signAssertion({ jti });

		const [result1, result2] = await Promise.all([
			exchangeCodeForTokens({
				code: code1,
				codeVerifier: cv1,
				assertion,
			}),
			exchangeCodeForTokens({
				code: code2,
				codeVerifier: cv2,
				assertion,
			}),
		]);

		const successCount = [result1, result2].filter((result) =>
			Boolean(result.data?.access_token),
		).length;
		const failureCount = [result1, result2].filter((result) =>
			Boolean(result.error?.status),
		).length;

		expect(successCount).toBe(1);
		expect(failureCount).toBe(1);
	});

	it("should reject wrong audience", async () => {
		const codeVerifier = generateRandomString(32);
		const code = await getAuthCode(assertionClient.client_id, codeVerifier);
		const assertion = await signAssertion({
			aud: "https://wrong-server.example.com/token",
		});

		const result = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
				client_id: assertionClient.client_id,
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: assertion,
				code_verifier: codeVerifier,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});

		expect(result.error?.status).toBeGreaterThanOrEqual(400);
	});

	it("should enforce auth method — secret client cannot use assertion", async () => {
		const codeVerifier = generateRandomString(32);
		const code = await getAuthCode(secretClient.client_id, codeVerifier);
		// Sign assertion for the secret-based client
		const assertion = await signAssertion({ clientId: secretClient.client_id });

		const result = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
				client_id: secretClient.client_id,
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: assertion,
				code_verifier: codeVerifier,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});

		expect(result.error?.status).toBeGreaterThanOrEqual(400);
	});

	it("should introspect an access token using private_key_jwt authentication", async () => {
		const codeVerifier = generateRandomString(32);
		const code = await getAuthCode(assertionClient.client_id, codeVerifier);
		const tokens = await exchangeCodeForTokens({
			code,
			codeVerifier,
			assertion: await signAssertion(),
		});
		expect(tokens.data?.access_token).toBeDefined();

		const result = await client.$fetch<{
			active?: boolean;
			client_id?: string;
		}>("/oauth2/introspect", {
			method: "POST",
			body: new URLSearchParams({
				client_id: assertionClient.client_id,
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: await signAssertion({ aud: introspectEndpoint }),
				token: tokens.data?.access_token ?? "",
				token_type_hint: "access_token",
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});

		expect(result.data?.active).toBe(true);
		expect(result.data?.client_id).toBe(assertionClient.client_id);
	});

	it("should revoke a refresh token using private_key_jwt authentication", async () => {
		const codeVerifier = generateRandomString(32);
		const code = await getAuthCode(assertionClient.client_id, codeVerifier, [
			"openid",
			"profile",
			"offline_access",
		]);
		const tokens = await exchangeCodeForTokens({
			code,
			codeVerifier,
			assertion: await signAssertion(),
		});
		expect(tokens.data?.refresh_token).toBeDefined();

		const result = await client.$fetch("/oauth2/revoke", {
			method: "POST",
			body: new URLSearchParams({
				client_id: assertionClient.client_id,
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				client_assertion: await signAssertion({ aud: revokeEndpoint }),
				token: tokens.data?.refresh_token ?? "",
				token_type_hint: "refresh_token",
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});

		expect(result.data).toBe(null);
		expect(result.error).toBe(null);
	});
});

describe("private_key_jwt registration validation", async () => {
	const authServerBaseUrl = "http://localhost:3001";
	const { auth, signInWithTestUser } = await getTestInstance({
		baseURL: authServerBaseUrl,
		trustedOrigins: ["https://trusted.example.com"],
		plugins: [
			jwt({ jwt: { issuer: authServerBaseUrl } }),
			oauthProvider({
				loginPage: "/login",
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
		],
	});
	const { headers } = await signInWithTestUser();

	it("should reject registration with both jwks and jwks_uri", async () => {
		const result = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: ["https://example.com/callback"],
				token_endpoint_auth_method: "private_key_jwt",
				jwks: [{ kty: "RSA", n: "test", e: "test-exponent" }],
				jwks_uri: "https://example.com/.well-known/jwks.json",
			},
			asResponse: true,
		});
		expect(result.status).toBeGreaterThanOrEqual(400);
	});

	it("should reject registration without jwks or jwks_uri", async () => {
		const result = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: ["https://example.com/callback"],
				token_endpoint_auth_method: "private_key_jwt",
			},
			asResponse: true,
		});
		expect(result.status).toBeGreaterThanOrEqual(400);
	});

	it("should reject jwks_uri with non-HTTPS scheme", async () => {
		const result = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: ["https://example.com/callback"],
				token_endpoint_auth_method: "private_key_jwt",
				jwks_uri: "http://example.com/.well-known/jwks.json",
			},
			asResponse: true,
		});
		expect(result.status).toBeGreaterThanOrEqual(400);
	});

	it("should reject jwks_uri from an untrusted origin", async () => {
		const result = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: ["https://example.com/callback"],
				token_endpoint_auth_method: "private_key_jwt",
				jwks_uri: "https://untrusted.example.com/.well-known/jwks.json",
			},
			asResponse: true,
		});
		expect(result.status).toBeGreaterThanOrEqual(400);
	});

	it("should reject jwks on non-private_key_jwt client", async () => {
		const result = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: ["https://example.com/callback"],
				token_endpoint_auth_method: "client_secret_post",
				jwks: [{ kty: "RSA", n: "test", e: "test-exponent" }],
			},
			asResponse: true,
		});
		expect(result.status).toBeGreaterThanOrEqual(400);
	});
});
