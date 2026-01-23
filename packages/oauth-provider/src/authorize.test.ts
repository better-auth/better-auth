import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import { createAuthorizationURL } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { beforeAll, describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthClient } from "./types/oauth";

describe("oauth authorize - unauthenticated", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
			jwt(),
		],
	});
	const { headers } = await signInWithTestUser();
	const unauthenticatedClient = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: {
			customFetchImpl,
		},
	});

	let oauthClient: OAuthClient | null;
	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;
	// Registers a confidential client application to work with
	beforeAll(async () => {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
			},
		});
		expect(response?.client_id).toBeDefined();
		expect(response?.user_id).toBeDefined();
		expect(response?.client_secret).toBeDefined();
		expect(response?.redirect_uris).toEqual([redirectUri]);
		oauthClient = response;
	});

	it("should always redirect to /login because user is not logged in", async () => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}
		const authUrl = await createAuthorizationURL({
			id: providerId,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
			},
			redirectURI: redirectUri,
			state: "123",
			scopes: ["openid"],
			responseType: "code",
			codeVerifier: generateRandomString(64),
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
		});

		let loginRedirectUrl = "";
		await unauthenticatedClient.$fetch(authUrl.toString(), {
			onError(context) {
				loginRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(loginRedirectUrl).toContain("/login");
		expect(loginRedirectUrl).toContain("response_type=code");
		expect(loginRedirectUrl).toContain(`client_id=${oauthClient.client_id}`);
		expect(loginRedirectUrl).toContain("scope=openid");
		expect(loginRedirectUrl).toContain(
			`redirect_uri=${encodeURIComponent(redirectUri)}`,
		);
	});
});

describe("oauth authorize - authenticated", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
			jwt(),
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

	let oauthClient: OAuthClient | null;
	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;
	// Registers a confidential client application to work with
	beforeAll(async () => {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
			},
		});
		expect(response?.client_id).toBeDefined();
		expect(response?.user_id).toBeDefined();
		expect(response?.client_secret).toBeDefined();
		expect(response?.redirect_uris).toEqual([redirectUri]);
		oauthClient = response;
	});

	it("should authorize - prompt undefined, response code, state set, with codeVerifier", async () => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}
		const codeVerifier = generateRandomString(64);
		const authUrl = await createAuthorizationURL({
			id: providerId,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
			},
			redirectURI: redirectUri,
			state: "123",
			scopes: ["openid"],
			responseType: "code",
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
			codeVerifier,
		});

		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackRedirectUrl).toContain(redirectUri);
		expect(callbackRedirectUrl).toContain(`code=`);
		expect(callbackRedirectUrl).toContain(`state=123`);
	});
});

describe("oauth authorize - PKCE requirements", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";

	describe("with requirePKCE: false (allow confidential clients without PKCE)", async () => {
		const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance(
			{
				baseURL: authServerBaseUrl,
				plugins: [
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						requirePKCE: false,
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
					jwt(),
				],
			},
		);
		const { headers } = await signInWithTestUser();
		const client = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: {
				customFetchImpl,
				headers,
			},
		});

		let confidentialClient: OAuthClient | null;
		let publicClient: OAuthClient | null;
		const providerId = "test";
		const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;

		beforeAll(async () => {
			// Create confidential client (web type = confidential)
			const confidentialResponse = await auth.api.adminCreateOAuthClient({
				headers,
				body: {
					redirect_uris: [redirectUri],
					skip_consent: true,
					type: "web",
				},
			});
			confidentialClient = confidentialResponse;

			// Create public client (native type = public)
			const publicResponse = await auth.api.adminCreateOAuthClient({
				headers,
				body: {
					redirect_uris: [redirectUri],
					skip_consent: true,
					type: "native",
				},
			});
			publicClient = publicResponse;
		});

		it("should reject public client without PKCE", async () => {
			if (!publicClient?.client_id) {
				throw Error("beforeAll not run properly");
			}

			const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
			authUrl.searchParams.set("client_id", publicClient.client_id);
			authUrl.searchParams.set("redirect_uri", redirectUri);
			authUrl.searchParams.set("response_type", "code");
			authUrl.searchParams.set("state", "123");
			authUrl.searchParams.set("scope", "openid");
			// Intentionally omit code_challenge

			let errorRedirectUrl = "";
			await client.$fetch(authUrl.toString(), {
				onError(context) {
					errorRedirectUrl = context.response.headers.get("Location") || "";
				},
			});
			expect(errorRedirectUrl).toContain(redirectUri);
			expect(errorRedirectUrl).toContain("error=invalid_request");
			expect(errorRedirectUrl).toContain(
				"error_description=pkce+is+required+for+public+clients",
			);
		});

		it("should allow confidential client without PKCE when requirePKCE=false", async () => {
			if (!confidentialClient?.client_id) {
				throw Error("beforeAll not run properly");
			}

			const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
			authUrl.searchParams.set("client_id", confidentialClient.client_id);
			authUrl.searchParams.set("redirect_uri", redirectUri);
			authUrl.searchParams.set("response_type", "code");
			authUrl.searchParams.set("state", "123");
			authUrl.searchParams.set("scope", "openid");
			// Intentionally omit code_challenge

			let callbackRedirectUrl = "";
			await client.$fetch(authUrl.toString(), {
				onError(context) {
					callbackRedirectUrl = context.response.headers.get("Location") || "";
				},
			});
			expect(callbackRedirectUrl).toContain(redirectUri);
			expect(callbackRedirectUrl).toContain("code=");
			expect(callbackRedirectUrl).toContain("state=123");
		});

		it("should reject offline_access without PKCE even for confidential clients", async () => {
			if (!confidentialClient?.client_id) {
				throw Error("beforeAll not run properly");
			}

			const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
			authUrl.searchParams.set("client_id", confidentialClient.client_id);
			authUrl.searchParams.set("redirect_uri", redirectUri);
			authUrl.searchParams.set("response_type", "code");
			authUrl.searchParams.set("state", "123");
			authUrl.searchParams.set("scope", "openid offline_access");
			// Intentionally omit code_challenge

			let errorRedirectUrl = "";
			await client.$fetch(authUrl.toString(), {
				onError(context) {
					errorRedirectUrl = context.response.headers.get("Location") || "";
				},
			});
			expect(errorRedirectUrl).toContain(redirectUri);
			expect(errorRedirectUrl).toContain("error=invalid_request");
			expect(errorRedirectUrl).toContain(
				"error_description=offline_access+scope+requires+PKCE",
			);
		});

		it("should allow offline_access with PKCE for confidential clients", async () => {
			if (
				!confidentialClient?.client_id ||
				!confidentialClient?.client_secret
			) {
				throw Error("beforeAll not run properly");
			}

			const codeVerifier = generateRandomString(64);
			const authUrl = await createAuthorizationURL({
				id: providerId,
				options: {
					clientId: confidentialClient.client_id,
					clientSecret: confidentialClient.client_secret,
				},
				redirectURI: redirectUri,
				state: "123",
				scopes: ["openid", "offline_access"],
				responseType: "code",
				authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
				codeVerifier,
			});

			let callbackRedirectUrl = "";
			await client.$fetch(authUrl.toString(), {
				onError(context) {
					callbackRedirectUrl = context.response.headers.get("Location") || "";
				},
			});
			expect(callbackRedirectUrl).toContain(redirectUri);
			expect(callbackRedirectUrl).toContain("code=");
			expect(callbackRedirectUrl).toContain("state=123");
		});
	});

	describe("with requirePKCE: true (default - require PKCE for all)", async () => {
		const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance(
			{
				baseURL: authServerBaseUrl,
				plugins: [
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						// requirePKCE defaults to true
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
					jwt(),
				],
			},
		);
		const { headers } = await signInWithTestUser();
		const client = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: {
				customFetchImpl,
				headers,
			},
		});

		let confidentialClient: OAuthClient | null;
		const providerId = "test";
		const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;

		beforeAll(async () => {
			const response = await auth.api.adminCreateOAuthClient({
				headers,
				body: {
					redirect_uris: [redirectUri],
					skip_consent: true,
					type: "web",
				},
			});
			confidentialClient = response;
		});

		it("should require PKCE for confidential client when requirePKCE=true", async () => {
			if (!confidentialClient?.client_id) {
				throw Error("beforeAll not run properly");
			}

			const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
			authUrl.searchParams.set("client_id", confidentialClient.client_id);
			authUrl.searchParams.set("redirect_uri", redirectUri);
			authUrl.searchParams.set("response_type", "code");
			authUrl.searchParams.set("state", "123");
			authUrl.searchParams.set("scope", "openid");
			// Intentionally omit code_challenge

			let errorRedirectUrl = "";
			await client.$fetch(authUrl.toString(), {
				onError(context) {
					errorRedirectUrl = context.response.headers.get("Location") || "";
				},
			});
			expect(errorRedirectUrl).toContain(redirectUri);
			expect(errorRedirectUrl).toContain("error=invalid_request");
			expect(errorRedirectUrl).toContain("error_description=pkce+is+required");
		});

		it("should allow confidential client with PKCE (S256)", async () => {
			if (
				!confidentialClient?.client_id ||
				!confidentialClient?.client_secret
			) {
				throw Error("beforeAll not run properly");
			}

			const codeVerifier = generateRandomString(64);
			const authUrl = await createAuthorizationURL({
				id: providerId,
				options: {
					clientId: confidentialClient.client_id,
					clientSecret: confidentialClient.client_secret,
				},
				redirectURI: redirectUri,
				state: "123",
				scopes: ["openid"],
				responseType: "code",
				authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
				codeVerifier,
			});

			let callbackRedirectUrl = "";
			await client.$fetch(authUrl.toString(), {
				onError(context) {
					callbackRedirectUrl = context.response.headers.get("Location") || "";
				},
			});
			expect(callbackRedirectUrl).toContain(redirectUri);
			expect(callbackRedirectUrl).toContain("code=");
			expect(callbackRedirectUrl).toContain("state=123");
		});
	});

	describe("with allowPlainCodeChallengeMethod: true", async () => {
		const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance(
			{
				baseURL: authServerBaseUrl,
				plugins: [
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						allowPlainCodeChallengeMethod: true,
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
					jwt(),
				],
			},
		);
		const { headers } = await signInWithTestUser();
		const client = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: {
				customFetchImpl,
				headers,
			},
		});

		let confidentialClient: OAuthClient | null;
		const providerId = "test";
		const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;

		beforeAll(async () => {
			const response = await auth.api.adminCreateOAuthClient({
				headers,
				body: {
					redirect_uris: [redirectUri],
					skip_consent: true,
				},
			});
			confidentialClient = response;
		});

		it("should allow plain code challenge method", async () => {
			if (!confidentialClient?.client_id) {
				throw Error("beforeAll not run properly");
			}

			const codeVerifier = generateRandomString(64);
			const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
			authUrl.searchParams.set("client_id", confidentialClient.client_id);
			authUrl.searchParams.set("redirect_uri", redirectUri);
			authUrl.searchParams.set("response_type", "code");
			authUrl.searchParams.set("state", "123");
			authUrl.searchParams.set("scope", "openid");
			authUrl.searchParams.set("code_challenge", codeVerifier); // plain uses verifier directly
			authUrl.searchParams.set("code_challenge_method", "plain");

			let callbackRedirectUrl = "";
			await client.$fetch(authUrl.toString(), {
				onError(context) {
					callbackRedirectUrl = context.response.headers.get("Location") || "";
				},
			});
			expect(callbackRedirectUrl).toContain(redirectUri);
			expect(callbackRedirectUrl).toContain("code=");
			expect(callbackRedirectUrl).toContain("state=123");
		});
	});

	describe("with allowPlainCodeChallengeMethod: false (default)", async () => {
		const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance(
			{
				baseURL: authServerBaseUrl,
				plugins: [
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						// allowPlainCodeChallengeMethod defaults to false
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
					jwt(),
				],
			},
		);
		const { headers } = await signInWithTestUser();
		const client = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: {
				customFetchImpl,
				headers,
			},
		});

		let confidentialClient: OAuthClient | null;
		const providerId = "test";
		const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;

		beforeAll(async () => {
			const response = await auth.api.adminCreateOAuthClient({
				headers,
				body: {
					redirect_uris: [redirectUri],
					skip_consent: true,
				},
			});
			confidentialClient = response;
		});

		it("should reject plain code challenge method when not enabled", async () => {
			if (!confidentialClient?.client_id) {
				throw Error("beforeAll not run properly");
			}

			const codeVerifier = generateRandomString(64);
			const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
			authUrl.searchParams.set("client_id", confidentialClient.client_id);
			authUrl.searchParams.set("redirect_uri", redirectUri);
			authUrl.searchParams.set("response_type", "code");
			authUrl.searchParams.set("state", "123");
			authUrl.searchParams.set("scope", "openid");
			authUrl.searchParams.set("code_challenge", codeVerifier);
			authUrl.searchParams.set("code_challenge_method", "plain");

			let errorRedirectUrl = "";
			await client.$fetch(authUrl.toString(), {
				onError(context) {
					errorRedirectUrl = context.response.headers.get("Location") || "";
				},
			});
			expect(errorRedirectUrl).toContain(redirectUri);
			expect(errorRedirectUrl).toContain("error=invalid_request");
			expect(errorRedirectUrl).toContain(
				"error_description=invalid+code_challenge+method",
			);
		});
	});
});
