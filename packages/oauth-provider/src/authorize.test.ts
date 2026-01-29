import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import { createAuthorizationURL } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { beforeAll, describe, expect, it } from "vitest";
import { validateIssuerUrl } from "./authorize";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthClient } from "./types/oauth";

describe("validateIssuerUrl (RFC 9207)", () => {
	it("should allow HTTPS URLs unchanged", () => {
		expect(validateIssuerUrl("https://auth.example.com")).toBe(
			"https://auth.example.com",
		);
	});

	it("should convert HTTP to HTTPS for non-localhost", () => {
		expect(validateIssuerUrl("http://auth.example.com")).toBe(
			"https://auth.example.com",
		);
	});

	it("should allow HTTP for localhost", () => {
		expect(validateIssuerUrl("http://localhost:3000")).toBe(
			"http://localhost:3000",
		);
	});

	it("should allow HTTP for 127.0.0.1", () => {
		expect(validateIssuerUrl("http://127.0.0.1:3000")).toBe(
			"http://127.0.0.1:3000",
		);
	});

	it("should strip query parameters", () => {
		expect(validateIssuerUrl("https://auth.example.com?foo=bar")).toBe(
			"https://auth.example.com",
		);
	});

	it("should strip fragment", () => {
		expect(validateIssuerUrl("https://auth.example.com#section")).toBe(
			"https://auth.example.com",
		);
	});

	it("should strip both query and fragment", () => {
		expect(validateIssuerUrl("https://auth.example.com?foo=bar#section")).toBe(
			"https://auth.example.com",
		);
	});

	it("should remove trailing slash", () => {
		expect(validateIssuerUrl("https://auth.example.com/")).toBe(
			"https://auth.example.com",
		);
	});

	it("should preserve path", () => {
		expect(validateIssuerUrl("https://auth.example.com/api/auth")).toBe(
			"https://auth.example.com/api/auth",
		);
	});

	it("should handle complex invalid URL and sanitize", () => {
		expect(
			validateIssuerUrl("http://auth.example.com:8080/path?query=1#hash"),
		).toBe("https://auth.example.com:8080/path");
	});
});

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

	it("should authorize and include iss parameter", async () => {
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
		expect(callbackRedirectUrl).toContain(
			`iss=${encodeURIComponent(authServerBaseUrl)}`,
		);
	});

	it("should include iss parameter in error responses", async () => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}
		const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
		authUrl.searchParams.set("client_id", oauthClient.client_id);
		authUrl.searchParams.set("redirect_uri", redirectUri);
		authUrl.searchParams.set("response_type", "code");
		authUrl.searchParams.set("scope", "openid");
		authUrl.searchParams.set("state", "error-test-state");

		let errorRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(context) {
				errorRedirectUrl = context.response.headers.get("Location") || "";
			},
		});

		expect(errorRedirectUrl).toContain(redirectUri);
		expect(errorRedirectUrl).toContain("error=invalid_request");
		expect(errorRedirectUrl).toContain("pkce");
		expect(errorRedirectUrl).toContain(`iss=`);
		expect(errorRedirectUrl).toContain(
			`iss=${encodeURIComponent(authServerBaseUrl)}`,
		);
	});

	it("should advertise authorization_response_iss_parameter_supported in metadata", async () => {
		const metadata = await auth.api.getOpenIdConfig();
		expect(metadata.authorization_response_iss_parameter_supported).toBe(true);
	});

	it("should have metadata issuer match iss parameter (RFC 9207)", async () => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const metadata = await auth.api.getOpenIdConfig();
		const metadataIssuer = metadata.issuer;

		const codeVerifier = generateRandomString(64);
		const authUrl = await createAuthorizationURL({
			id: providerId,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
			},
			redirectURI: redirectUri,
			state: "issuer-match-test",
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

		const redirectUrl = new URL(callbackRedirectUrl);
		const issParam = redirectUrl.searchParams.get("iss");

		expect(issParam).toBe(metadataIssuer);
	});
});
