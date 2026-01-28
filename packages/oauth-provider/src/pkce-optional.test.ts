import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import {
	createAuthorizationCodeRequest,
	createAuthorizationURL,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { beforeAll, describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthClient } from "./types/oauth";

/**
 * Resolves a URL that may be relative or absolute
 */
function resolveUrl(url: string, baseUrl: string): URL {
	try {
		// Try to parse as absolute URL first
		return new URL(url);
	} catch {
		// If it fails, resolve as relative URL
		return new URL(url, baseUrl);
	}
}

describe("PKCE optional - default behavior", async () => {
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
	const authenticatedClient = createAuthClient({
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
		// Create confidential client
		const confResponse = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
			},
		});
		confidentialClient = confResponse;

		// Create public client
		const pubResponse = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
				token_endpoint_auth_method: "none",
			},
		});
		publicClient = pubResponse;
	});

	it("public client without PKCE should fail", async () => {
		if (!publicClient?.client_id) {
			throw Error("beforeAll not run properly");
		}

		// Try to authorize without PKCE
		const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
		authUrl.searchParams.set("client_id", publicClient.client_id);
		authUrl.searchParams.set("redirect_uri", redirectUri);
		authUrl.searchParams.set("response_type", "code");
		authUrl.searchParams.set("scope", "openid");
		authUrl.searchParams.set("state", "123");
		// Intentionally omit code_challenge and code_challenge_method

		let errorRedirect = "";
		await authenticatedClient.$fetch(authUrl.toString(), {
			onError(context) {
				errorRedirect = context.response.headers.get("Location") || "";
			},
		});

		expect(errorRedirect).toContain("error=invalid_request");
		expect(errorRedirect).toContain("pkce+is+required+for+this+client");
	});

	it("confidential client without PKCE should fail with default settings", async () => {
		if (!confidentialClient?.client_id) {
			throw Error("beforeAll not run properly");
		}

		// Try to authorize without PKCE
		const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
		authUrl.searchParams.set("client_id", confidentialClient.client_id);
		authUrl.searchParams.set("redirect_uri", redirectUri);
		authUrl.searchParams.set("response_type", "code");
		authUrl.searchParams.set("scope", "openid");
		authUrl.searchParams.set("state", "123");
		// Intentionally omit code_challenge and code_challenge_method

		let errorRedirect = "";
		await authenticatedClient.$fetch(authUrl.toString(), {
			onError(context) {
				errorRedirect = context.response.headers.get("Location") || "";
			},
		});

		expect(errorRedirect).toContain("error=invalid_request");
		expect(errorRedirect).toContain("pkce+is+required+for+this+client");
	});

	it("confidential client with PKCE should succeed", async () => {
		if (!confidentialClient?.client_id || !confidentialClient?.client_secret) {
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
			codeVerifier,
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
		});

		let callbackUrl = "";
		await authenticatedClient.$fetch(authUrl.toString(), {
			onError(context) {
				callbackUrl = context.response.headers.get("Location") || "";
			},
		});

		expect(callbackUrl).toContain(redirectUri);
		expect(callbackUrl).toContain("code=");
		expect(callbackUrl).toContain("state=123");
		expect(callbackUrl).not.toContain("error=");
	});
});

describe("PKCE optional - per-client opt-out", async () => {
	const authServerBaseUrl = "http://localhost:3001";
	const rpBaseUrl = "http://localhost:5001";
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
	const authenticatedClient = createAuthClient({
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
		// Create confidential client with PKCE disabled
		const confResponse = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
				require_pkce: false,
			},
		});
		confidentialClient = confResponse;

		// Create public client
		const pubResponse = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
				token_endpoint_auth_method: "none",
			},
		});
		publicClient = pubResponse;
	});

	it("public client without PKCE should always fail", async () => {
		if (!publicClient?.client_id) {
			throw Error("beforeAll not run properly");
		}

		// Try to authorize without PKCE
		const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
		authUrl.searchParams.set("client_id", publicClient.client_id);
		authUrl.searchParams.set("redirect_uri", redirectUri);
		authUrl.searchParams.set("response_type", "code");
		authUrl.searchParams.set("scope", "openid");
		authUrl.searchParams.set("state", "123");
		// Intentionally omit code_challenge and code_challenge_method

		let errorRedirect = "";
		await authenticatedClient.$fetch(authUrl.toString(), {
			onError(context) {
				errorRedirect = context.response.headers.get("Location") || "";
			},
		});

		expect(errorRedirect).toContain("error=invalid_request");
		expect(errorRedirect).toContain("pkce+is+required+for+this+client");
	});

	it("confidential client without PKCE should succeed", async () => {
		if (!confidentialClient?.client_id) {
			throw Error("beforeAll not run properly");
		}

		// Authorize without PKCE
		const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
		authUrl.searchParams.set("client_id", confidentialClient.client_id);
		authUrl.searchParams.set("redirect_uri", redirectUri);
		authUrl.searchParams.set("response_type", "code");
		authUrl.searchParams.set("scope", "openid");
		authUrl.searchParams.set("state", "123");

		let callbackUrl = "";
		await authenticatedClient.$fetch(authUrl.toString(), {
			onError(context) {
				callbackUrl = context.response.headers.get("Location") || "";
			},
		});

		expect(callbackUrl).toContain(redirectUri);
		expect(callbackUrl).not.toContain("code_challenge=");
		expect(callbackUrl).toContain("state=123");
		expect(callbackUrl).not.toContain("error=");

		// Extract code and exchange for token with client_secret
		const url = resolveUrl(callbackUrl, authServerBaseUrl);
		const code = url.searchParams.get("code");
		expect(code).toBeDefined();

		const { body, headers } = createAuthorizationCodeRequest({
			code: code!,
			redirectURI: redirectUri,
			options: {
				clientId: confidentialClient.client_id,
				clientSecret: confidentialClient.client_secret,
				redirectURI: redirectUri,
			},
		});

		const tokenResponse = await authenticatedClient.$fetch<{
			access_token?: string;
			id_token?: string;
			refresh_token?: string;
		}>("/oauth2/token", {
			method: "POST",
			body,
			headers,
		});

		expect(tokenResponse.data?.access_token).toBeDefined();
		expect(tokenResponse.data?.id_token).toBeDefined();
	});
});

describe("PKCE optional - offline_access scope", async () => {
	const authServerBaseUrl = "http://localhost:3002";
	const rpBaseUrl = "http://localhost:5002";
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
	const authenticatedClient = createAuthClient({
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
		const confResponse = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
				require_pkce: false, // Explicitly optional
			},
		});
		confidentialClient = confResponse;
	});

	it("offline_access without PKCE should fail even with requirePKCE: false", async () => {
		if (!confidentialClient?.client_id) {
			throw Error("beforeAll not run properly");
		}

		// Try to authorize with offline_access but without PKCE
		const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
		authUrl.searchParams.set("client_id", confidentialClient.client_id);
		authUrl.searchParams.set("redirect_uri", redirectUri);
		authUrl.searchParams.set("response_type", "code");
		authUrl.searchParams.set("scope", "openid offline_access");
		authUrl.searchParams.set("state", "123");

		let errorRedirect = "";
		await authenticatedClient.$fetch(authUrl.toString(), {
			onError(context) {
				errorRedirect = context.response.headers.get("Location") || "";
			},
		});

		expect(errorRedirect).toContain("error=invalid_request");
		expect(errorRedirect).toContain("pkce+is+required+for+this+client");
	});

	it("offline_access with PKCE should succeed", async () => {
		if (!confidentialClient?.client_id || !confidentialClient?.client_secret) {
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
			codeVerifier,
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
		});

		let callbackUrl = "";
		await authenticatedClient.$fetch(authUrl.toString(), {
			onError(context) {
				callbackUrl = context.response.headers.get("Location") || "";
			},
		});

		expect(callbackUrl).toContain(redirectUri);
		expect(callbackUrl).toContain("code=");
		expect(callbackUrl).not.toContain("error=");

		// Exchange for token - should get refresh token
		const url = resolveUrl(callbackUrl, authServerBaseUrl);
		const code = url.searchParams.get("code");
		expect(code).toBeDefined();

		const { body, headers } = createAuthorizationCodeRequest({
			code: code!,
			redirectURI: redirectUri,
			codeVerifier,
			options: {
				clientId: confidentialClient.client_id,
				clientSecret: confidentialClient.client_secret,
				redirectURI: redirectUri,
			},
		});

		const tokenResponse = await authenticatedClient.$fetch<{
			access_token?: string;
			id_token?: string;
			refresh_token?: string;
		}>("/oauth2/token", {
			method: "POST",
			body,
			headers,
		});

		expect(tokenResponse.data?.access_token).toBeDefined();
		expect(tokenResponse.data?.refresh_token).toBeDefined();
	});
});

describe("PKCE optional - consistency checks", async () => {
	const authServerBaseUrl = "http://localhost:3003";
	const rpBaseUrl = "http://localhost:5003";
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
	const authenticatedClient = createAuthClient({
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
		const confResponse = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
				require_pkce: false,
			},
		});
		confidentialClient = confResponse;
	});

	it("PKCE in auth but not in token should fail", async () => {
		if (!confidentialClient?.client_id || !confidentialClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		// Authorize WITH PKCE
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
			codeVerifier,
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
		});

		let callbackUrl = "";
		await authenticatedClient.$fetch(authUrl.toString(), {
			onError(context) {
				callbackUrl = context.response.headers.get("Location") || "";
			},
		});

		const url = resolveUrl(callbackUrl, authServerBaseUrl);
		const code = url.searchParams.get("code");
		expect(code).toBeDefined();

		// Try to exchange WITHOUT code_verifier (should fail)
		const { body, headers } = createAuthorizationCodeRequest({
			code: code!,
			redirectURI: redirectUri,
			// Intentionally omit codeVerifier
			options: {
				clientId: confidentialClient.client_id,
				clientSecret: confidentialClient.client_secret,
				redirectURI: redirectUri,
			},
		});

		const tokenResponse = await authenticatedClient.$fetch("/oauth2/token", {
			method: "POST",
			body,
			headers,
			onError(context) {
				expect(context.response.status).toBe(401);
			},
		});

		expect(tokenResponse.error).toBeDefined();
	});

	it("PKCE not in auth but in token should fail", async () => {
		if (!confidentialClient?.client_id || !confidentialClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		// Authorize WITHOUT PKCE
		const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
		authUrl.searchParams.set("client_id", confidentialClient.client_id);
		authUrl.searchParams.set("redirect_uri", redirectUri);
		authUrl.searchParams.set("response_type", "code");
		authUrl.searchParams.set("scope", "openid");
		authUrl.searchParams.set("state", "123");

		let callbackUrl = "";
		await authenticatedClient.$fetch(authUrl.toString(), {
			onError(context) {
				callbackUrl = context.response.headers.get("Location") || "";
			},
		});

		const url = resolveUrl(callbackUrl, authServerBaseUrl);
		const code = url.searchParams.get("code");
		expect(code).toBeDefined();

		// Try to exchange WITH code_verifier (should fail)
		const wrongCodeVerifier = generateRandomString(64);
		const { body, headers } = createAuthorizationCodeRequest({
			code: code!,
			redirectURI: redirectUri,
			codeVerifier: wrongCodeVerifier,
			options: {
				clientId: confidentialClient.client_id,
				clientSecret: confidentialClient.client_secret,
				redirectURI: redirectUri,
			},
		});

		const tokenResponse = await authenticatedClient.$fetch("/oauth2/token", {
			method: "POST",
			body,
			headers,
			onError(context) {
				expect(context.response.status).toBe(401);
			},
		});

		expect(tokenResponse.error).toBeDefined();
	});

	it("mismatched PKCE challenge should fail", async () => {
		if (!confidentialClient?.client_id || !confidentialClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		// Authorize with PKCE
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
			codeVerifier,
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
		});

		let callbackUrl = "";
		await authenticatedClient.$fetch(authUrl.toString(), {
			onError(context) {
				callbackUrl = context.response.headers.get("Location") || "";
			},
		});

		const url = resolveUrl(callbackUrl, authServerBaseUrl);
		const code = url.searchParams.get("code");
		expect(code).toBeDefined();

		// Try to exchange with WRONG code_verifier
		const wrongVerifier = generateRandomString(64);
		const { body, headers } = createAuthorizationCodeRequest({
			code: code!,
			redirectURI: redirectUri,
			codeVerifier: wrongVerifier,
			options: {
				clientId: confidentialClient.client_id,
				clientSecret: confidentialClient.client_secret,
				redirectURI: redirectUri,
			},
		});

		const tokenResponse = await authenticatedClient.$fetch("/oauth2/token", {
			method: "POST",
			body,
			headers,
			onError(context) {
				expect(context.response.status).toBe(401);
			},
		});

		expect(tokenResponse.error).toBeDefined();
	});
});
