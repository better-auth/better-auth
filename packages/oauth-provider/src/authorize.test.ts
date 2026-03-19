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

	it("should return login_required when prompt=none and user is not logged in", async () => {
		if (!oauthClient?.client_id) {
			throw Error("beforeAll not run properly");
		}

		const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
		authUrl.searchParams.set("client_id", oauthClient.client_id);
		authUrl.searchParams.set("redirect_uri", redirectUri);
		authUrl.searchParams.set("response_type", "code");
		authUrl.searchParams.set("scope", "openid");
		authUrl.searchParams.set("state", "prompt-none-login-required");
		authUrl.searchParams.set("prompt", "none");
		authUrl.searchParams.set("code_challenge", generateRandomString(43));
		authUrl.searchParams.set("code_challenge_method", "S256");

		let callbackRedirectUrl = "";
		await unauthenticatedClient.$fetch(authUrl.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});

		expect(callbackRedirectUrl).toContain(redirectUri);
		expect(callbackRedirectUrl).toContain("error=login_required");
		expect(callbackRedirectUrl).toContain("state=prompt-none-login-required");
		expect(callbackRedirectUrl).toContain(
			`iss=${encodeURIComponent(authServerBaseUrl)}`,
		);
		expect(callbackRedirectUrl).not.toContain("/login");
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
	let oauthClientNeedsConsent: OAuthClient | null;
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

		const responseNeedsConsent = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: false,
			},
		});
		expect(responseNeedsConsent?.client_id).toBeDefined();
		expect(responseNeedsConsent?.user_id).toBeDefined();
		expect(responseNeedsConsent?.client_secret).toBeDefined();
		expect(responseNeedsConsent?.redirect_uris).toEqual([redirectUri]);
		oauthClientNeedsConsent = responseNeedsConsent;
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

	it("should return consent_required when prompt=none and consent is needed", async () => {
		if (!oauthClientNeedsConsent?.client_id) {
			throw Error("beforeAll not run properly");
		}

		const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
		authUrl.searchParams.set("client_id", oauthClientNeedsConsent.client_id);
		authUrl.searchParams.set("redirect_uri", redirectUri);
		authUrl.searchParams.set("response_type", "code");
		authUrl.searchParams.set("scope", "openid");
		authUrl.searchParams.set("state", "prompt-none-consent-required");
		authUrl.searchParams.set("prompt", "none");
		authUrl.searchParams.set("code_challenge", generateRandomString(43));
		authUrl.searchParams.set("code_challenge_method", "S256");

		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});

		expect(callbackRedirectUrl).toContain(redirectUri);
		expect(callbackRedirectUrl).toContain("error=consent_required");
		expect(callbackRedirectUrl).toContain("state=prompt-none-consent-required");
		expect(callbackRedirectUrl).toContain(
			`iss=${encodeURIComponent(authServerBaseUrl)}`,
		);
		expect(callbackRedirectUrl).not.toContain("/consent");
	});
});

describe("oauth authorize - custom validateRedirectUri", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";

	// Custom validation function that accepts any localhost subdomain
	// This simulates wildcard matching like *.localhost
	const customValidator = (uri: string, registeredUris: string[]): boolean => {
		// First check exact match
		if (registeredUris.includes(uri)) {
			return true;
		}
		// Allow any *.localhost subdomain if localhost is registered
		try {
			const url = new URL(uri);
			if (url.hostname.endsWith(".localhost")) {
				// Check if base localhost pattern is registered
				return registeredUris.some((registered) => {
					const registeredUrl = new URL(registered);
					return (
						registeredUrl.hostname === "localhost" &&
						registeredUrl.port === url.port &&
						registeredUrl.pathname === url.pathname
					);
				});
			}
		} catch {
			return false;
		}
		return false;
	};

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				validateRedirectUri: customValidator,
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
	// Register with base localhost URI
	const registeredUri = `${rpBaseUrl}/callback`;
	// Use a subdomain that matches our custom validator logic
	const subdomainUri = "http://pr-123.localhost:5000/callback";

	beforeAll(async () => {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [registeredUri],
				skip_consent: true,
			},
		});
		expect(response?.client_id).toBeDefined();
		oauthClient = response;
	});

	it("should accept redirect_uri matching custom validation logic", async () => {
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
			redirectURI: subdomainUri,
			state: "custom-validator-test",
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

		// Should redirect to the subdomain URI with authorization code
		expect(callbackRedirectUrl).toContain("pr-123.localhost");
		expect(callbackRedirectUrl).toContain("code=");
		expect(callbackRedirectUrl).toContain("state=custom-validator-test");
	});

	it("should reject redirect_uri not matching custom validation", async () => {
		if (!oauthClient?.client_id) {
			throw Error("beforeAll not run properly");
		}
		// Use a completely different domain
		const unauthorizedUri = "http://localhost:9999/evil";

		const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
		authUrl.searchParams.set("client_id", oauthClient.client_id);
		authUrl.searchParams.set("redirect_uri", unauthorizedUri);
		authUrl.searchParams.set("response_type", "code");
		authUrl.searchParams.set("scope", "openid");
		authUrl.searchParams.set("state", "unauthorized-test");
		authUrl.searchParams.set("code_challenge", generateRandomString(43));
		authUrl.searchParams.set("code_challenge_method", "S256");

		let errorRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(context) {
				errorRedirectUrl = context.response.headers.get("Location") || "";
			},
		});

		// Should redirect to error page, not the unauthorized URI
		expect(errorRedirectUrl).toContain("error=invalid_redirect");
		expect(errorRedirectUrl).not.toContain("localhost:9999");
	});
});

describe("oauth authorize - validateRedirectUri error handling", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";

	// Validator that throws an error for certain URIs
	const throwingValidator = (
		uri: string,
		_registeredUris: string[],
	): boolean => {
		if (uri.includes("throw-error")) {
			throw new Error("Validator intentionally threw");
		}
		return uri === "http://localhost:5000/callback";
	};

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				validateRedirectUri: throwingValidator,
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
	const redirectUri = `${rpBaseUrl}/callback`;

	beforeAll(async () => {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
			},
		});
		expect(response?.client_id).toBeDefined();
		oauthClient = response;
	});

	it("should fail closed when validator throws an exception", async () => {
		if (!oauthClient?.client_id) {
			throw Error("beforeAll not run properly");
		}
		// Use a URI that will cause the validator to throw
		const throwingUri = "http://throw-error.localhost:5000/callback";

		const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
		authUrl.searchParams.set("client_id", oauthClient.client_id);
		authUrl.searchParams.set("redirect_uri", throwingUri);
		authUrl.searchParams.set("response_type", "code");
		authUrl.searchParams.set("scope", "openid");
		authUrl.searchParams.set("state", "validator-throws-test");
		authUrl.searchParams.set("code_challenge", generateRandomString(43));
		authUrl.searchParams.set("code_challenge_method", "S256");

		let errorRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(context) {
				errorRedirectUrl = context.response.headers.get("Location") || "";
			},
		});

		// Should fail closed - redirect to error page, not the attacker URI
		expect(errorRedirectUrl).toContain("error=invalid_redirect");
		expect(errorRedirectUrl).not.toContain("throw-error");
	});
});
