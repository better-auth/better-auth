import { createAuthClient } from "better-auth/client";
import { generateRandomString, makeSignature } from "better-auth/crypto";
import { createAuthorizationURL } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { validateIssuerUrl } from "./authorize";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import {
	canonicalizeOAuthQueryParams,
	postLoginClearedParam,
	setSignedOAuthQueryParameterNames,
	signedQueryIssuedAtParam,
} from "./signed-query";
import type { OAuthClient } from "./types/oauth";
import { verifyOAuthQueryParams } from "./utils";

const signedQueryParameterNameParam = "ba_param";

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

describe("oauth signed query signatures", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const createSignedParams = async (
		secret: string,
		configure?: (params: URLSearchParams) => void,
	) => {
		const params = new URLSearchParams();
		params.set("client_id", "client-a");
		params.set("redirect_uri", "https://rp.example.com/callback");
		params.set("response_type", "code");
		params.set("scope", "openid profile");
		params.set("state", "state-a");
		configure?.(params);
		params.set("exp", String(Math.floor(Date.now() / 1000) + 600));
		params.set(signedQueryIssuedAtParam, String(Date.now()));
		setSignedOAuthQueryParameterNames(params);
		params.set(
			"sig",
			await makeSignature(
				canonicalizeOAuthQueryParams(params).toString(),
				secret,
			),
		);
		return params;
	};

	it("should verify signed params when query params are reordered", async () => {
		const signedParams = await createSignedParams("test-secret");
		const reordered = new URLSearchParams();

		for (const [key, value] of [...signedParams.entries()].reverse()) {
			reordered.append(key, value);
		}

		expect(
			await verifyOAuthQueryParams(reordered.toString(), "test-secret"),
		).toBe(true);
	});

	it("should verify signed params when repeated values are reordered", async () => {
		const signedParams = await createSignedParams("test-secret", (params) => {
			params.append("resource", "https://b.example.com");
			params.append("resource", "https://a.example.com");
		});
		const reordered = new URLSearchParams();

		for (const [key, value] of [...signedParams.entries()].reverse()) {
			reordered.append(key, value);
		}

		expect(
			await verifyOAuthQueryParams(reordered.toString(), "test-secret"),
		).toBe(true);
	});

	it("should reject tampered signed params", async () => {
		const signedParams = await createSignedParams("test-secret");
		signedParams.set("client_id", "client-b");

		expect(
			await verifyOAuthQueryParams(signedParams.toString(), "test-secret"),
		).toBe(false);
	});

	it("should reject duplicate signature params", async () => {
		const signedParams = await createSignedParams("test-secret");
		signedParams.append("sig", "extra-sig");

		expect(
			await verifyOAuthQueryParams(signedParams.toString(), "test-secret"),
		).toBe(false);
	});

	it("should preserve custom signed params when the client copies reordered signed queries", async () => {
		const signedParams = await createSignedParams("test-secret", (params) => {
			params.set("custom_authorization_context", "tenant-a");
			params.append("resource", "https://api.example.com");
		});
		const reorderedParams = new URLSearchParams();
		for (const [key, value] of [...signedParams.entries()].reverse()) {
			reorderedParams.append(key, value);
		}
		reorderedParams.append("utm_email", "user@example.com");

		vi.stubGlobal("window", {
			location: {
				search: `?${reorderedParams.toString()}`,
			},
		});

		const plugin = oauthProviderClient();
		const onRequest = plugin.fetchPlugins[0]?.hooks?.onRequest;
		const ctx = {
			method: "POST",
			headers: new Headers({
				"content-type": "application/json",
			}),
			body: "{}",
		};

		await onRequest?.(ctx as Parameters<NonNullable<typeof onRequest>>[0]);

		const body = JSON.parse(String(ctx.body));
		const forwardedParams = new URLSearchParams(body.oauth_query);
		expect(await verifyOAuthQueryParams(body.oauth_query, "test-secret")).toBe(
			true,
		);
		expect(forwardedParams.get("custom_authorization_context")).toBe(
			"tenant-a",
		);
		expect(forwardedParams.get("resource")).toBe("https://api.example.com");
		expect(forwardedParams.get("utm_email")).toBeNull();
		expect(forwardedParams.getAll(signedQueryParameterNameParam)).toContain(
			"custom_authorization_context",
		);
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

	it("should replace incoming sig when signing the login redirect", async () => {
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
			state: "incoming-sig",
			scopes: ["openid"],
			responseType: "code",
			codeVerifier: generateRandomString(64),
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
		});
		authUrl.searchParams.append("sig", "attacker-sig");

		let loginRedirectUrl = "";
		await unauthenticatedClient.$fetch(authUrl.toString(), {
			onError(context) {
				loginRedirectUrl = context.response.headers.get("Location") || "";
			},
		});

		const loginRedirect = new URL(loginRedirectUrl, authServerBaseUrl);
		const secret = (auth.options as unknown as { secret: string }).secret;
		const reordered = new URLSearchParams();

		for (const [key, value] of [
			...loginRedirect.searchParams.entries(),
		].reverse()) {
			reordered.append(key, value);
		}

		expect(loginRedirect.searchParams.getAll("sig")).toHaveLength(1);
		expect(loginRedirect.searchParams.get("sig")).not.toBe("attacker-sig");
		expect(
			await verifyOAuthQueryParams(loginRedirect.search.slice(1), secret),
		).toBe(true);
		expect(await verifyOAuthQueryParams(reordered.toString(), secret)).toBe(
			true,
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

describe("oauth authorize - request_uri resolution", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;
	const requestUri = "urn:better-auth:par:test";
	const requestUriWithPostLoginMarker = "urn:better-auth:par:post-login";

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				requestUriResolver: async ({ requestUri: receivedRequestUri }) => {
					const resolvedParams = {
						response_type: "code",
						redirect_uri: redirectUri,
						scope: "openid",
						state: "par-state",
						code_challenge: "a".repeat(43),
						code_challenge_method: "S256",
					};

					if (receivedRequestUri === requestUri) {
						return resolvedParams;
					}

					if (receivedRequestUri === requestUriWithPostLoginMarker) {
						return {
							...resolvedParams,
							[postLoginClearedParam]: "attacker-session",
						};
					}

					return null;
				},
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

	it("should sign the resolved PAR parameters for the login redirect", async () => {
		if (!oauthClient?.client_id) {
			throw Error("beforeAll not run properly");
		}

		const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
		authUrl.searchParams.set("client_id", oauthClient.client_id);
		authUrl.searchParams.set("request_uri", requestUri);

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
		expect(loginRedirectUrl).toContain("state=par-state");
		expect(loginRedirectUrl).not.toContain("request_uri=");
	});

	it("should drop reserved post-login markers from resolved PAR parameters", async () => {
		if (!oauthClient?.client_id) {
			throw Error("beforeAll not run properly");
		}

		const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
		authUrl.searchParams.set("client_id", oauthClient.client_id);
		authUrl.searchParams.set("request_uri", requestUriWithPostLoginMarker);

		let loginRedirectUrl = "";
		await unauthenticatedClient.$fetch(authUrl.toString(), {
			onError(context) {
				loginRedirectUrl = context.response.headers.get("Location") || "";
			},
		});

		const loginRedirect = new URL(loginRedirectUrl, authServerBaseUrl);
		expect(loginRedirect.pathname).toBe("/login");
		expect(loginRedirect.searchParams.get(postLoginClearedParam)).toBeNull();
	});

	/**
	 * RFC 9126 §4: params must come from the stored request, not the URL.
	 * Extra URL params like prompt or scope must not leak into the signed redirect.
	 */
	it("should discard front-channel params not in the stored PAR request", async () => {
		if (!oauthClient?.client_id) {
			throw Error("beforeAll not run properly");
		}

		const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
		authUrl.searchParams.set("client_id", oauthClient.client_id);
		authUrl.searchParams.set("request_uri", requestUri);
		// These params are NOT in the PAR payload — must be discarded
		authUrl.searchParams.set("prompt", "none");
		authUrl.searchParams.set("scope", "openid profile admin");

		let loginRedirectUrl = "";
		await unauthenticatedClient.$fetch(authUrl.toString(), {
			onError(context) {
				loginRedirectUrl = context.response.headers.get("Location") || "";
			},
		});

		expect(loginRedirectUrl).toContain("/login");
		// PAR-resolved scope must win, not the URL-injected one
		expect(loginRedirectUrl).toContain("scope=openid");
		expect(loginRedirectUrl).not.toContain("admin");
		// prompt=none was not in the PAR payload — must not appear
		expect(loginRedirectUrl).not.toContain("prompt=none");
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
