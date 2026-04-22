import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { sessionMiddleware } from "better-auth/api";
import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import { createAuthorizationURL } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { validateIssuerUrl } from "./authorize";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthConsent, Scope } from "./types";
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
	const redirectUri = `${rpBaseUrl}/api/auth/callback/${providerId}`;
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

describe("oauth authorize - request_uri resolution", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/callback/${providerId}`;
	const requestUri = "urn:better-auth:par:test";

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				requestUriResolver: async ({ requestUri: receivedRequestUri }) => {
					if (receivedRequestUri !== requestUri) {
						return null;
					}

					return {
						response_type: "code",
						redirect_uri: redirectUri,
						scope: "openid",
						state: "par-state",
						code_challenge: "a".repeat(43),
						code_challenge_method: "S256",
					};
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
	const redirectUri = `${rpBaseUrl}/api/auth/callback/${providerId}`;
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

	it("should return invalid_target for invalid resource with explicit description", async () => {
		if (!oauthClient?.client_id) {
			throw Error("beforeAll not run properly");
		}

		const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
		authUrl.searchParams.set("client_id", oauthClient.client_id);
		authUrl.searchParams.set("redirect_uri", redirectUri);
		authUrl.searchParams.set("response_type", "code");
		authUrl.searchParams.set("scope", "openid");
		authUrl.searchParams.set("state", "invalid-resource-state");
		authUrl.searchParams.set("resource", "https://resource.example.com");
		authUrl.searchParams.set("code_challenge", generateRandomString(43));
		authUrl.searchParams.set("code_challenge_method", "S256");

		let errorRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(context) {
				errorRedirectUrl = context.response.headers.get("Location") || "";
			},
		});

		expect(errorRedirectUrl).toContain(redirectUri);
		expect(errorRedirectUrl).toContain("error=invalid_target");
		expect(errorRedirectUrl).toContain("state=invalid-resource-state");
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

describe("oauth authorize - consented resources", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const validAudience = "https://api.example.com";
	const secondValidAudience = "https://api.secondary.example.com";
	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/callback/${providerId}`;

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				validAudiences: [validAudience, secondValidAudience],
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
			jwt(),
			{
				id: "createLegacyConsentTester",
				endpoints: {
					testerCreateConsent: createAuthEndpoint(
						"/server/oauth2/consent",
						{
							method: "POST",
							body: z.object({
								clientId: z.string(),
								scopes: z.array(z.string()),
								userId: z.string(),
							}),
							use: [sessionMiddleware],
							metadata: {
								SERVER_ONLY: true,
							},
						},
						async (ctx) => {
							const iat = Math.floor(Date.now() / 1000);
							return (await ctx.context.adapter.create({
								model: "oauthConsent",
								data: {
									createdAt: new Date(iat * 1000),
									updatedAt: new Date(iat * 1000),
									...ctx.body,
								},
							})) as OAuthConsent<Scope[]>;
						},
					),
				},
			} satisfies BetterAuthPlugin,
		],
	});

	const { headers, user } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: {
			customFetchImpl,
			headers,
		},
	});

	let oauthClientNeedsConsent: OAuthClient | null;
	beforeAll(async () => {
		const responseNeedsConsent = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: false,
			},
		});
		expect(responseNeedsConsent?.client_id).toBeDefined();
		oauthClientNeedsConsent = responseNeedsConsent;

		await auth.api.testerCreateConsent({
			headers,
			body: {
				clientId: responseNeedsConsent.client_id,
				userId: user.id,
				scopes: ["openid"],
			},
		});
	});

	it("should re-prompt for consent when stored consent has no resources and a resource is requested", async () => {
		if (!oauthClientNeedsConsent?.client_id) {
			throw Error("beforeAll not run properly");
		}

		const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
		authUrl.searchParams.set("client_id", oauthClientNeedsConsent.client_id);
		authUrl.searchParams.set("redirect_uri", redirectUri);
		authUrl.searchParams.set("response_type", "code");
		authUrl.searchParams.set("scope", "openid");
		authUrl.searchParams.set("state", "legacy-consent-no-resource");
		authUrl.searchParams.set("resource", validAudience);
		authUrl.searchParams.set("code_challenge", generateRandomString(43));
		authUrl.searchParams.set("code_challenge_method", "S256");

		let consentRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(context) {
				consentRedirectUrl = context.response.headers.get("Location") || "";
			},
		});

		expect(consentRedirectUrl).toContain("/consent");
		expect(consentRedirectUrl).not.toContain(`${redirectUri}?code=`);
	});

	it("should persist multiple resource values onto OAuthConsent.resources", async ({
		onTestFinished,
	}) => {
		if (!oauthClientNeedsConsent?.client_id) {
			throw Error("beforeAll not run properly");
		}

		const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
		authUrl.searchParams.set("client_id", oauthClientNeedsConsent.client_id);
		authUrl.searchParams.set("redirect_uri", redirectUri);
		authUrl.searchParams.set("response_type", "code");
		authUrl.searchParams.set("scope", "openid");
		authUrl.searchParams.set("state", "multiple-resources-persist");
		authUrl.searchParams.append("resource", validAudience);
		authUrl.searchParams.append("resource", secondValidAudience);
		authUrl.searchParams.set("code_challenge", generateRandomString(43));
		authUrl.searchParams.set("code_challenge_method", "S256");

		let consentRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(context) {
				consentRedirectUrl = context.response.headers.get("Location") || "";
			},
		});

		expect(consentRedirectUrl).toContain("/consent");

		vi.stubGlobal("window", {
			location: {
				search: new URL(consentRedirectUrl, authServerBaseUrl).search,
			},
		});
		onTestFinished(() => {
			vi.unstubAllGlobals();
		});

		const consentResult = await client.oauth2.consent(
			{
				accept: true,
			},
			{
				throw: true,
			},
		);

		expect(consentResult.url).toContain(`${redirectUri}?code=`);

		const context = await auth.$context;
		const savedConsent = await context.adapter.findOne<OAuthConsent<Scope[]>>({
			model: "oauthConsent",
			where: [
				{
					field: "clientId",
					value: oauthClientNeedsConsent.client_id,
				},
				{
					field: "userId",
					value: user.id,
				},
			],
		});

		expect(savedConsent?.resources).toEqual([
			validAudience,
			secondValidAudience,
		]);
	});

	it("should return consent_required for prompt=none when requested resource is not covered by prior consent", async () => {
		const dedicatedClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: false,
			},
		});
		if (!dedicatedClient?.client_id) {
			throw Error("unable to create dedicated client");
		}

		await auth.api.testerCreateConsent({
			headers,
			body: {
				clientId: dedicatedClient.client_id,
				userId: user.id,
				scopes: ["openid"],
			},
		});

		const authUrl = new URL(`${authServerBaseUrl}/api/auth/oauth2/authorize`);
		authUrl.searchParams.set("client_id", dedicatedClient.client_id);
		authUrl.searchParams.set("redirect_uri", redirectUri);
		authUrl.searchParams.set("response_type", "code");
		authUrl.searchParams.set("scope", "openid");
		authUrl.searchParams.set("state", "prompt-none-resource-consent");
		authUrl.searchParams.set("prompt", "none");
		authUrl.searchParams.set("resource", validAudience);
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
		expect(callbackRedirectUrl).toContain("state=prompt-none-resource-consent");
		expect(callbackRedirectUrl).toContain(
			`iss=${encodeURIComponent(authServerBaseUrl)}`,
		);
		expect(callbackRedirectUrl).not.toContain("/consent");
	});
});
