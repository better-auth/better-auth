import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import {
	createAuthorizationCodeRequest,
	createAuthorizationURL,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { APIError } from "better-call";
import { decodeJwt } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthClient } from "./types/oauth";

describe("pairwise subject identifiers", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const rpBaseUrl2 = "http://localhost:6000";
	const validAudience = "https://myapi.example.com";

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt({
				jwt: {
					issuer: authServerBaseUrl,
				},
			}),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				pairwiseSecret: "test-pairwise-secret-key-32chars!!",
				validAudiences: [validAudience],
				allowDynamicClientRegistration: true,
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
		baseURL: authServerBaseUrl,
		fetchOptions: {
			customFetchImpl,
			headers,
		},
	});

	let pairwiseClientA: OAuthClient | null;
	let pairwiseClientB: OAuthClient | null;
	let publicClient: OAuthClient | null;
	let sameHostClientA: OAuthClient | null;

	const redirectUriA = `${rpBaseUrl}/api/auth/callback/test-a`;
	const redirectUriB = `${rpBaseUrl2}/api/auth/callback/test-b`;
	const redirectUriSameHost = `${rpBaseUrl}/api/auth/callback/test-same`;
	const redirectUriPublic = `${rpBaseUrl}/api/auth/callback/test-public`;

	beforeAll(async () => {
		pairwiseClientA = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUriA],
				scope: "openid profile email offline_access",
				skip_consent: true,
				subject_type: "pairwise",
			},
		});
		expect(pairwiseClientA?.client_id).toBeDefined();

		pairwiseClientB = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUriB],
				scope: "openid profile email offline_access",
				skip_consent: true,
				subject_type: "pairwise",
			},
		});
		expect(pairwiseClientB?.client_id).toBeDefined();

		publicClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUriPublic],
				scope: "openid profile email offline_access",
				skip_consent: true,
			},
		});
		expect(publicClient?.client_id).toBeDefined();

		sameHostClientA = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUriSameHost],
				scope: "openid profile email offline_access",
				skip_consent: true,
				subject_type: "pairwise",
			},
		});
		expect(sameHostClientA?.client_id).toBeDefined();
	});

	async function getTokensForClient(
		oauthClient: OAuthClient,
		redirectUri: string,
		overrides?: {
			resource?: string;
		},
	) {
		const codeVerifier = generateRandomString(32);
		const url = await createAuthorizationURL({
			id: "test",
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret!,
				redirectURI: redirectUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
			state: "test-state",
			scopes: ["openid", "profile", "email", "offline_access"],
			codeVerifier,
		});

		let callbackRedirectUrl = "";
		await client.$fetch(url.toString(), {
			headers,
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		const callbackUrl = new URL(callbackRedirectUrl);
		const code = callbackUrl.searchParams.get("code")!;

		const { body, headers: reqHeaders } = createAuthorizationCodeRequest({
			code,
			codeVerifier,
			redirectURI: redirectUri,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret!,
				redirectURI: redirectUri,
			},
			resource: overrides?.resource,
		});

		const tokens = await client.$fetch<{
			access_token?: string;
			id_token?: string;
			refresh_token?: string;
			expires_in?: number;
			token_type?: string;
			scope?: string;
		}>("/oauth2/token", {
			method: "POST",
			body,
			headers: reqHeaders,
		});

		return tokens;
	}

	it("should produce different sub across pairwise clients (cross-RP unlinkability)", async () => {
		const tokensA = await getTokensForClient(pairwiseClientA!, redirectUriA);
		const tokensB = await getTokensForClient(pairwiseClientB!, redirectUriB);

		const idTokenA = decodeJwt(tokensA.data!.id_token!);
		const idTokenB = decodeJwt(tokensB.data!.id_token!);

		expect(idTokenA.sub).toBeDefined();
		expect(idTokenB.sub).toBeDefined();
		// Different sectors → different pairwise sub
		expect(idTokenA.sub).not.toBe(idTokenB.sub);
	});

	it("should produce same sub for same pairwise client (determinism)", async () => {
		const tokens1 = await getTokensForClient(pairwiseClientA!, redirectUriA);
		const tokens2 = await getTokensForClient(pairwiseClientA!, redirectUriA);

		const idToken1 = decodeJwt(tokens1.data!.id_token!);
		const idToken2 = decodeJwt(tokens2.data!.id_token!);

		expect(idToken1.sub).toBe(idToken2.sub);
	});

	it("should return user.id as sub for public client (fallback)", async () => {
		const publicTokens = await getTokensForClient(
			publicClient!,
			redirectUriPublic,
		);
		const pairwiseTokens = await getTokensForClient(
			pairwiseClientA!,
			redirectUriA,
		);

		const publicIdToken = decodeJwt(publicTokens.data!.id_token!);
		const pairwiseIdToken = decodeJwt(pairwiseTokens.data!.id_token!);

		expect(publicIdToken.sub).toBeDefined();
		// Public sub differs from pairwise sub for same user
		expect(publicIdToken.sub).not.toBe(pairwiseIdToken.sub);
	});

	it("should produce same pairwise sub for clients on same host (sector isolation)", async () => {
		const tokensA = await getTokensForClient(pairwiseClientA!, redirectUriA);
		const tokensSameHost = await getTokensForClient(
			sameHostClientA!,
			redirectUriSameHost,
		);

		const idTokenA = decodeJwt(tokensA.data!.id_token!);
		const idTokenSameHost = decodeJwt(tokensSameHost.data!.id_token!);

		// Same host (localhost) → same sector → same pairwise sub
		expect(idTokenA.sub).toBe(idTokenSameHost.sub);
	});

	it("should have consistent sub between id_token and userinfo", async () => {
		const tokens = await getTokensForClient(pairwiseClientA!, redirectUriA);
		const idToken = decodeJwt(tokens.data!.id_token!);

		const userinfo = await client.$fetch<{ sub?: string }>("/oauth2/userinfo", {
			method: "GET",
			headers: {
				authorization: `Bearer ${tokens.data!.access_token}`,
			},
		});

		expect(userinfo.data?.sub).toBe(idToken.sub);
	});

	it("should return pairwise sub in opaque access token introspection", async () => {
		const tokens = await getTokensForClient(pairwiseClientA!, redirectUriA);

		const introspection = await client.oauth2.introspect(
			{
				client_id: pairwiseClientA!.client_id,
				client_secret: pairwiseClientA!.client_secret,
				token: tokens.data!.access_token!,
				token_type_hint: "access_token",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);

		const idToken = decodeJwt(tokens.data!.id_token!);
		expect(introspection.data?.active).toBe(true);
		expect(introspection.data?.sub).toBe(idToken.sub);
	});

	it("should preserve pairwise sub after token refresh", async () => {
		const tokens = await getTokensForClient(pairwiseClientA!, redirectUriA);
		const originalIdToken = decodeJwt(tokens.data!.id_token!);

		const refreshBody = new URLSearchParams({
			grant_type: "refresh_token",
			client_id: pairwiseClientA!.client_id,
			client_secret: pairwiseClientA!.client_secret!,
			refresh_token: tokens.data!.refresh_token!,
		});

		const refreshResponse = await client.$fetch<{
			access_token?: string;
			id_token?: string;
			refresh_token?: string;
		}>("/oauth2/token", {
			method: "POST",
			body: refreshBody,
			headers: {
				"content-type": "application/x-www-form-urlencoded",
			},
		});

		expect(refreshResponse.data?.id_token).toBeDefined();
		const refreshedIdToken = decodeJwt(refreshResponse.data!.id_token!);
		expect(refreshedIdToken.sub).toBe(originalIdToken.sub);
	});

	it("should keep user.id in JWT access token sub (not pairwise)", async () => {
		const tokens = await getTokensForClient(pairwiseClientA!, redirectUriA, {
			resource: validAudience,
		});

		const accessToken = decodeJwt(tokens.data!.access_token!);
		const idToken = decodeJwt(tokens.data!.id_token!);

		// JWT access token uses real user.id for user lookup
		expect(accessToken.sub).toBeDefined();
		expect(accessToken.sub).not.toBe(idToken.sub);
	});
});

describe("pairwise DCR validation", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const redirectUri = `${rpBaseUrl}/api/auth/callback/test`;

	it("should reject pairwise subject_type when pairwiseSecret not configured", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			baseURL: authServerBaseUrl,
			plugins: [
				jwt(),
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
		await expect(
			auth.api.adminCreateOAuthClient({
				headers,
				body: {
					redirect_uris: [redirectUri],
					subject_type: "pairwise",
				},
			}),
		).rejects.toThrow(APIError);
	});

	it("should accept pairwise subject_type when pairwiseSecret is configured", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			baseURL: authServerBaseUrl,
			plugins: [
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					pairwiseSecret: "test-secret-for-dcr-test-32chars!",
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
				}),
			],
		});

		const { headers } = await signInWithTestUser();
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				subject_type: "pairwise",
				skip_consent: true,
			},
		});

		expect(response?.client_id).toBeDefined();
		expect(response?.subject_type).toBe("pairwise");
	});

	it("should default to public when no subject_type specified", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			baseURL: authServerBaseUrl,
			plugins: [
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					pairwiseSecret: "test-secret-for-dcr-test-32chars!",
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
				}),
			],
		});

		const { headers } = await signInWithTestUser();
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
			},
		});

		expect(response?.client_id).toBeDefined();
		expect(response?.subject_type).toBeUndefined();
	});

	it("should reject pairwise client with redirect_uris on different hosts", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			baseURL: authServerBaseUrl,
			plugins: [
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					pairwiseSecret: "test-secret-for-dcr-test-32chars!",
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
				}),
			],
		});

		const { headers } = await signInWithTestUser();
		await expect(
			auth.api.adminCreateOAuthClient({
				headers,
				body: {
					redirect_uris: [
						"https://app-a.example.com/callback",
						"https://app-b.example.com/callback",
					],
					subject_type: "pairwise",
				},
			}),
		).rejects.toThrow(APIError);
	});

	it("should accept pairwise client with redirect_uris on the same host", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			baseURL: authServerBaseUrl,
			plugins: [
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					pairwiseSecret: "test-secret-for-dcr-test-32chars!",
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
				}),
			],
		});

		const { headers } = await signInWithTestUser();
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [
					"https://app.example.com/callback-a",
					"https://app.example.com/callback-b",
				],
				subject_type: "pairwise",
				skip_consent: true,
			},
		});

		expect(response?.client_id).toBeDefined();
		expect(response?.subject_type).toBe("pairwise");
	});

	it("should round-trip subject_type through DCR", async () => {
		const { signInWithTestUser, customFetchImpl } = await getTestInstance({
			baseURL: authServerBaseUrl,
			plugins: [
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					pairwiseSecret: "test-secret-for-dcr-test-32chars!",
					allowDynamicClientRegistration: true,
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
				}),
			],
		});

		const { headers } = await signInWithTestUser();
		const dcrClient = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: {
				customFetchImpl,
				headers,
			},
		});

		const response = await dcrClient.$fetch<OAuthClient>("/oauth2/register", {
			method: "POST",
			body: {
				redirect_uris: [redirectUri],
				subject_type: "pairwise",
				token_endpoint_auth_method: "none",
			},
		});

		expect(response.data?.subject_type).toBe("pairwise");
	});
});

describe("pairwise configuration validation", () => {
	it("should reject pairwiseSecret shorter than 32 characters", () => {
		expect(() =>
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				pairwiseSecret: "too-short",
			}),
		).toThrow("pairwiseSecret must be at least 32 characters");
	});

	it("should accept pairwiseSecret of 32+ characters", () => {
		expect(() =>
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				pairwiseSecret: "a-valid-secret-that-is-32-chars!",
			}),
		).not.toThrow();
	});
});

describe("pairwise metadata", async () => {
	const authServerBaseUrl = "http://localhost:3000";

	it("should include pairwise in subject_types_supported when secret configured", async () => {
		const { auth } = await getTestInstance({
			baseURL: authServerBaseUrl,
			plugins: [
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					pairwiseSecret: "test-pairwise-metadata-secret!!!",
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
				}),
			],
		});

		const metadata = await auth.api.getOpenIdConfig();
		expect(metadata.subject_types_supported).toEqual(["public", "pairwise"]);
	});

	it("should only include public when no pairwise secret", async () => {
		const { auth } = await getTestInstance({
			baseURL: authServerBaseUrl,
			plugins: [
				jwt(),
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

		const metadata = await auth.api.getOpenIdConfig();
		expect(metadata.subject_types_supported).toEqual(["public"]);
	});
});
