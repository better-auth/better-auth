import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import type { Listener } from "listhen";
import { listen } from "listhen";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	test,
} from "vitest";
import type { AuthClient } from "../../client";
import { createAuthClient } from "../../client";
import { toNodeHandler } from "../../integrations/node";
import { getTestInstance } from "../../test-utils/test-instance";
import { genericOAuth } from "../generic-oauth";
import { genericOAuthClient } from "../generic-oauth/client";
import { jwt } from "../jwt";
import { oidcProvider } from ".";
import type { OidcClientPlugin } from "./client";
import { oidcClient } from "./client";
import type { Client } from "./types";

// Type for the server client with OIDC plugin
type ServerClient = AuthClient<{
	plugins: [OidcClientPlugin];
}>;

/**
 * Helper to handle OIDC consent flow when required per OIDC spec
 */
async function handleConsentFlow(
	redirectURI: string,
	serverClient: ServerClient,
	sessionHeaders: Headers,
	consentHeaders: Headers,
): Promise<string> {
	if (!redirectURI.includes("consent_code=")) {
		return redirectURI;
	}

	// Extract consent code from redirect URL
	const url = new URL(redirectURI, "http://localhost:3000");
	const consentCode = url.searchParams.get("consent_code");

	if (!consentCode) {
		throw new Error("Consent code not found in redirect URL");
	}

	// Merge session headers with consent cookies
	const authHeaders = new Headers(sessionHeaders);
	consentHeaders.forEach((value, key) => {
		if (key.toLowerCase() === "cookie") {
			const existing = authHeaders.get("Cookie") || "";
			authHeaders.set("Cookie", existing ? `${existing}; ${value}` : value);
		} else {
			authHeaders.set(key, value);
		}
	});

	// Accept consent
	const response = await serverClient.oauth2.consent(
		{ accept: true, consent_code: consentCode },
		{ headers: authHeaders, throw: true },
	);

	return response.redirectURI;
}

describe("oidc init", () => {
	it("default options", () => {
		const provider = oidcProvider({
			loginPage: "/login",
		});
		const options = provider.options;
		expect(options).toMatchInlineSnapshot(`
			{
			  "accessTokenExpiresIn": 3600,
			  "allowPlainCodeChallengeMethod": true,
			  "codeExpiresIn": 600,
			  "defaultScope": "openid",
			  "loginPage": "/login",
			  "refreshTokenExpiresIn": 604800,
			  "scopes": [
			    "openid",
			    "profile",
			    "email",
			    "offline_access",
			  ],
			  "storeClientSecret": "plain",
			}
		`);
	});
});

describe("oidc", async () => {
	const {
		auth: authorizationServer,
		signInWithTestUser,
		customFetchImpl,
		testUser,
	} = await getTestInstance({
		baseURL: "http://localhost:3000",
		plugins: [
			oidcProvider({
				loginPage: "/login",
				consentPage: "/oauth2/authorize",
				requirePKCE: true,
				getAdditionalUserInfoClaim(user) {
					return {
						custom: "custom value",
						userId: user.id,
					};
				},
			}),
			jwt(),
		],
	});
	const { headers } = await signInWithTestUser();
	const serverClient = createAuthClient({
		plugins: [oidcClient()],
		baseURL: "http://localhost:3000",
		fetchOptions: {
			customFetchImpl,
			headers,
		},
	});

	let server: Listener;

	beforeAll(async () => {
		server = await listen(toNodeHandler(authorizationServer.handler), {
			port: 3000,
		});
	});

	afterAll(async () => {
		await server.close();
	});

	let application: Client = {
		clientId: "test-client-id",
		clientSecret: "test-client-secret-oidc",
		redirectUrls: ["http://localhost:3000/api/auth/oauth2/callback/test"],
		metadata: {},
		type: "web",
		disabled: false,
		name: "test",
	};

	it("should create oidc client", async ({ expect }) => {
		const createdClient = await serverClient.oauth2.register({
			client_name: application.name,
			redirect_uris: application.redirectUrls,
			logo_uri: application.icon,
		});
		expect(createdClient.data).toMatchObject({
			client_id: expect.any(String),
			client_secret: expect.any(String),
			client_name: "test",
			redirect_uris: ["http://localhost:3000/api/auth/oauth2/callback/test"],
			grant_types: ["authorization_code"],
			response_types: ["code"],
			token_endpoint_auth_method: "client_secret_basic",
			client_id_issued_at: expect.any(Number),
			client_secret_expires_at: 0,
		});
		if (createdClient.data) {
			application = {
				clientId: createdClient.data.client_id,
				clientSecret: createdClient.data.client_secret,
				redirectUrls: createdClient.data.redirect_uris,
				metadata: {},
				icon: createdClient.data.logo_uri,
				type: "web",
				disabled: false,
				name: createdClient.data.client_name!,
			};
		}
		const client = await authorizationServer.api.getOAuthClient({
			params: {
				id: application.clientId,
			},
			headers,
		});
		expect(client).toEqual({
			clientId: application.clientId,
			name: application.name,
			icon: null,
		});
	});

	it("should sign in the user with the provider", async ({ expect }) => {
		// The RP (Relying Party) - the client application
		const { customFetchImpl: customFetchImplRP, cookieSetter } =
			await getTestInstance({
				account: {
					accountLinking: {
						trustedProviders: ["test"],
					},
				},
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "test",
								clientId: application.clientId,
								clientSecret: application.clientSecret || "",
								authorizationUrl:
									"http://localhost:3000/api/auth/oauth2/authorize",
								tokenUrl: "http://localhost:3000/api/auth/oauth2/token",
								scopes: ["openid", "profile", "email"],
								pkce: true,
							},
						],
					}),
				],
			});

		const client = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: "http://localhost:5000",
			fetchOptions: {
				customFetchImpl: customFetchImplRP,
			},
		});
		const oAuthHeaders = new Headers();
		const data = await client.signIn.oauth2(
			{
				providerId: "test",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
				onSuccess: cookieSetter(oAuthHeaders),
			},
		);
		expect(data.url).toContain(
			"http://localhost:3000/api/auth/oauth2/authorize",
		);
		expect(data.url).toContain(`client_id=${application.clientId}`);

		// Make the authorization request
		let redirectURI = "";
		const consentHeaders = new Headers();
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				redirectURI = context.response.headers.get("Location") || "";
				// Capture any consent cookies
				cookieSetter(consentHeaders)(context);
			},
		});

		// Handle consent flow if required (per OIDC spec for non-trusted clients)
		redirectURI = await handleConsentFlow(
			redirectURI,
			serverClient,
			headers,
			consentHeaders,
		);

		// Verify we got an authorization code
		expect(redirectURI).toContain(
			"http://localhost:3000/api/auth/oauth2/callback/test?code=",
		);

		// Complete the OAuth flow
		let callbackURL = "";
		await client.$fetch(redirectURI, {
			headers: oAuthHeaders,
			onError(context) {
				callbackURL = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackURL).toContain("/dashboard");
	});

	it("should sign in after a consent flow", async ({ expect }) => {
		// The RP (Relying Party) - the client application
		const { customFetchImpl: customFetchImplRP, cookieSetter } =
			await getTestInstance({
				account: {
					accountLinking: {
						trustedProviders: ["test"],
					},
				},
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "test",
								clientId: application.clientId,
								clientSecret: application.clientSecret || "",
								authorizationUrl:
									"http://localhost:3000/api/auth/oauth2/authorize",
								tokenUrl: "http://localhost:3000/api/auth/oauth2/token",
								scopes: ["openid", "profile", "email"],
								prompt: "consent",
								pkce: true,
							},
						],
					}),
				],
			});

		const client = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: "http://localhost:5000",
			fetchOptions: {
				customFetchImpl: customFetchImplRP,
			},
		});
		const oAuthHeaders = new Headers();
		const data = await client.signIn.oauth2(
			{
				providerId: "test",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
				onSuccess: cookieSetter(oAuthHeaders),
			},
		);
		expect(data.url).toContain(
			"http://localhost:3000/api/auth/oauth2/authorize",
		);
		expect(data.url).toContain(`client_id=${application.clientId}`);

		let redirectURI = "";
		const newHeaders = new Headers();
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				redirectURI = context.response.headers.get("Location") || "";
				cookieSetter(newHeaders)(context);
				newHeaders.append("Cookie", headers.get("Cookie") || "");
			},
		});
		expect(redirectURI).toContain("/oauth2/authorize?");
		expect(redirectURI).toContain("consent_code=");
		expect(redirectURI).toContain("client_id=");

		// No need to extract consent_code - it's in the signed cookie
		const res = await serverClient.oauth2.consent(
			{
				accept: true,
			},
			{
				headers: newHeaders,
				throw: true,
			},
		);
		expect(res.redirectURI).toContain(
			"http://localhost:3000/api/auth/oauth2/callback/test?code=",
		);

		let callbackURL = "";
		await client.$fetch(res.redirectURI, {
			headers: oAuthHeaders,
			onError(context) {
				callbackURL = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackURL).toContain("/dashboard");
	});

	it("should sign in after a login flow", async ({ expect }) => {
		// The RP (Relying Party) - the client application
		const { customFetchImpl: customFetchImplRP, cookieSetter } =
			await getTestInstance({
				account: {
					accountLinking: {
						trustedProviders: ["test"],
					},
				},
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "test",
								clientId: application.clientId,
								clientSecret: application.clientSecret || "",
								authorizationUrl:
									"http://localhost:3000/api/auth/oauth2/authorize",
								tokenUrl: "http://localhost:3000/api/auth/oauth2/token",
								scopes: ["openid", "profile", "email"],
								prompt: "login",
								pkce: true,
							},
						],
					}),
				],
			});

		const client = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: "http://localhost:5000",
			fetchOptions: {
				customFetchImpl: customFetchImplRP,
			},
		});
		const oAuthHeaders = new Headers();
		const data = await client.signIn.oauth2(
			{
				providerId: "test",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
				onSuccess: cookieSetter(oAuthHeaders),
			},
		);
		expect(data.url).toContain(
			"http://localhost:3000/api/auth/oauth2/authorize",
		);
		expect(data.url).toContain(`client_id=${application.clientId}`);

		let redirectURI = "";
		const newHeaders = new Headers();
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				redirectURI = context.response.headers.get("Location") || "";
				cookieSetter(newHeaders)(context);
			},
			headers: newHeaders,
		});
		expect(redirectURI).toContain("/login");

		await serverClient.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				headers: newHeaders,
				onError(context) {
					redirectURI = context.response.headers.get("Location") || "";
					cookieSetter(newHeaders)(context);
				},
			},
		);

		expect(redirectURI).toContain(
			"http://localhost:3000/api/auth/oauth2/callback/test?code=",
		);
		let callbackURL = "";
		await client.$fetch(redirectURI, {
			headers: oAuthHeaders,
			onError(context) {
				callbackURL = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackURL).toContain("/dashboard");
	});

	describe("prompt parameter handling", () => {
		it("should return login_required error when prompt=none and user not authenticated", async ({
			expect,
		}) => {
			// Create an unauthenticated client
			const unauthClient = createAuthClient({
				plugins: [oidcClient()],
				baseURL: "http://localhost:3000",
				fetchOptions: {
					customFetchImpl,
				},
			});

			// Try to authorize with prompt=none
			const authUrl = new URL(
				"http://localhost:3000/api/auth/oauth2/authorize",
			);
			authUrl.searchParams.set("client_id", application.clientId);
			authUrl.searchParams.set(
				"redirect_uri",
				application.redirectUrls[0] || "",
			);
			authUrl.searchParams.set("response_type", "code");
			authUrl.searchParams.set("scope", "openid profile email");
			authUrl.searchParams.set("state", "test-state");
			authUrl.searchParams.set("prompt", "none");
			authUrl.searchParams.set("code_challenge", "test-challenge");
			authUrl.searchParams.set("code_challenge_method", "S256");

			let redirectURI = "";
			await unauthClient.$fetch(authUrl.toString(), {
				method: "GET",
				onError(context) {
					redirectURI = context.response.headers.get("Location") || "";
				},
			});

			expect(redirectURI).toContain("error=login_required");
			expect(redirectURI).toContain("error_description=Authentication");
			expect(redirectURI).toContain("prompt");
			expect(redirectURI).toContain("none");
		});

		it("should return consent_required error when prompt=none and consent needed", async ({
			expect,
		}) => {
			// Create a new OAuth application that requires consent
			const newClient = await serverClient.oauth2.register({
				client_name: "test-consent-required",
				redirect_uris: ["http://localhost:3000/api/auth/oauth2/callback/test2"],
			});

			// Create a fresh user session that hasn't consented to this new client yet
			const { headers: freshHeaders } = await signInWithTestUser();

			// Try to authorize with prompt=none on the new client
			const authUrl = new URL(
				"http://localhost:3000/api/auth/oauth2/authorize",
			);
			authUrl.searchParams.set("client_id", newClient.data?.client_id || "");
			authUrl.searchParams.set(
				"redirect_uri",
				newClient.data?.redirect_uris[0] || "",
			);
			authUrl.searchParams.set("response_type", "code");
			authUrl.searchParams.set("scope", "openid profile email");
			authUrl.searchParams.set("state", "test-state");
			authUrl.searchParams.set("prompt", "none");
			authUrl.searchParams.set("code_challenge", "test-challenge");
			authUrl.searchParams.set("code_challenge_method", "S256");

			let redirectURI = "";
			await customFetchImpl(authUrl.toString(), {
				method: "GET",
				headers: freshHeaders,
				redirect: "manual",
			}).then((res) => {
				redirectURI = res.headers.get("Location") || "";
			});

			expect(redirectURI).toContain("error=consent_required");
			expect(redirectURI).toContain("error_description=Consent");
			expect(redirectURI).toContain("prompt");
			expect(redirectURI).toContain("none");
		});

		it("should succeed with prompt=none when user authenticated and consented", async ({
			expect,
		}) => {
			// Create a new client for this test
			const testClient = await serverClient.oauth2.register({
				client_name: "test-prompt-none-success",
				redirect_uris: [
					"http://localhost:3000/api/auth/oauth2/callback/test-none",
				],
			});

			// First, establish consent by doing a normal authorization flow
			const authUrl1 = new URL(
				"http://localhost:3000/api/auth/oauth2/authorize",
			);
			authUrl1.searchParams.set("client_id", testClient.data?.client_id || "");
			authUrl1.searchParams.set(
				"redirect_uri",
				testClient.data?.redirect_uris[0] || "",
			);
			authUrl1.searchParams.set("response_type", "code");
			authUrl1.searchParams.set("scope", "openid profile email");
			authUrl1.searchParams.set("state", "initial-state");
			authUrl1.searchParams.set("code_challenge", "test-challenge");
			authUrl1.searchParams.set("code_challenge_method", "S256");

			let consentRedirect = "";
			await serverClient.$fetch(authUrl1.toString(), {
				method: "GET",
				onError(context) {
					consentRedirect = context.response.headers.get("Location") || "";
				},
			});

			// If consent is required, accept it
			if (consentRedirect.includes("consent_code=")) {
				const consentUrl = new URL(consentRedirect, "http://localhost:3000");
				const consentCode = consentUrl.searchParams.get("consent_code");

				await serverClient.oauth2.consent(
					{ accept: true, consent_code: consentCode },
					{ throw: true },
				);
			}

			// Now test prompt=none - should succeed since consent is established
			const authUrl = new URL(
				"http://localhost:3000/api/auth/oauth2/authorize",
			);
			authUrl.searchParams.set("client_id", testClient.data?.client_id || "");
			authUrl.searchParams.set(
				"redirect_uri",
				testClient.data?.redirect_uris[0] || "",
			);
			authUrl.searchParams.set("response_type", "code");
			authUrl.searchParams.set("scope", "openid profile email");
			authUrl.searchParams.set("state", "test-state");
			authUrl.searchParams.set("prompt", "none");
			authUrl.searchParams.set("code_challenge", "test-challenge");
			authUrl.searchParams.set("code_challenge_method", "S256");

			let redirectURI = "";
			await serverClient.$fetch(authUrl.toString(), {
				method: "GET",
				onError(context) {
					redirectURI = context.response.headers.get("Location") || "";
				},
			});

			// Should succeed with authorization code
			expect(redirectURI).toContain("code=");
			expect(redirectURI).toContain("state=test-state");
			expect(redirectURI).not.toContain("error=");
		});

		it("should handle prompt=login with consent requirement", async ({
			expect,
		}) => {
			// Create a new client that will require consent
			const loginConsentClient = await serverClient.oauth2.register({
				client_name: "test-login-consent",
				redirect_uris: [
					"http://localhost:3000/api/auth/oauth2/callback/login-consent",
				],
			});

			// User is already authenticated, but we force login with prompt=login
			const authUrl = new URL(
				"http://localhost:3000/api/auth/oauth2/authorize",
			);
			authUrl.searchParams.set(
				"client_id",
				loginConsentClient.data?.client_id || "",
			);
			authUrl.searchParams.set(
				"redirect_uri",
				loginConsentClient.data?.redirect_uris[0] || "",
			);
			authUrl.searchParams.set("response_type", "code");
			authUrl.searchParams.set("scope", "openid profile email");
			authUrl.searchParams.set("state", "test-state");
			authUrl.searchParams.set("prompt", "login"); // Force login even though already authenticated
			authUrl.searchParams.set("code_challenge", "test-challenge");
			authUrl.searchParams.set("code_challenge_method", "S256");

			let redirectURI = "";
			const loginHeaders = new Headers();
			await serverClient.$fetch(authUrl.toString(), {
				method: "GET",
				onError(context) {
					redirectURI = context.response.headers.get("Location") || "";
					// Capture any cookies from the redirect
					const setCookie = context.response.headers.get("set-cookie");
					if (setCookie) {
						loginHeaders.set("Cookie", setCookie);
					}
				},
			});

			// Should redirect to login page
			expect(redirectURI).toContain("/login");
			expect(redirectURI).toContain("client_id");

			await serverClient.signIn.email(
				{
					email: testUser.email,
					password: testUser.password,
				},
				{
					headers: loginHeaders,
					onError(context) {
						redirectURI = context.response.headers.get("Location") || "";
						// Capture session cookies
						const setCookie = context.response.headers.get("set-cookie");
						if (setCookie) {
							const existing = loginHeaders.get("Cookie") || "";
							loginHeaders.set(
								"Cookie",
								existing ? `${existing}; ${setCookie}` : setCookie,
							);
						}
					},
				},
			);

			// After login with prompt=login removed, should proceed to consent
			// Should NOT still be redirecting to login
			expect(redirectURI).not.toContain("/login");
			// Should have consent_code (since this is a new client requiring consent)
			expect(redirectURI).toContain("consent_code=");

			// Extract consent code and accept consent
			const consentUrl = new URL(redirectURI, "http://localhost:3000");
			const consentCode = consentUrl.searchParams.get("consent_code");
			expect(consentCode).toBeTruthy();

			const consentResponse = await serverClient.oauth2.consent(
				{ accept: true, consent_code: consentCode },
				{ headers: loginHeaders, throw: true },
			);

			// After consent, should redirect to the client's redirect_uri with code
			expect(consentResponse.redirectURI).toContain(
				loginConsentClient.data?.redirect_uris[0] || "",
			);
			expect(consentResponse.redirectURI).toContain("code=");
			expect(consentResponse.redirectURI).toContain("state=test-state");
		});
	});

	describe("max_age parameter handling", () => {
		it("should force re-authentication when session age exceeds max_age", async ({
			expect,
		}) => {
			// This test verifies that max_age triggers re-authentication
			// In a real scenario, we'd need to manipulate session creation time
			// For now, we test with max_age=0 which should always trigger re-authentication

			const authUrl = new URL(
				"http://localhost:3000/api/auth/oauth2/authorize",
			);
			authUrl.searchParams.set("client_id", application.clientId);
			authUrl.searchParams.set(
				"redirect_uri",
				application.redirectUrls[0] || "",
			);
			authUrl.searchParams.set("response_type", "code");
			authUrl.searchParams.set("scope", "openid profile email");
			authUrl.searchParams.set("state", "test-state");
			authUrl.searchParams.set("max_age", "0"); // Force immediate re-authentication
			authUrl.searchParams.set("code_challenge", "test-challenge");
			authUrl.searchParams.set("code_challenge_method", "S256");

			let redirectURI = "";
			await serverClient.$fetch(authUrl.toString(), {
				method: "GET",
				onError(context) {
					redirectURI = context.response.headers.get("Location") || "";
				},
			});

			// Should redirect to login page (same behavior as prompt=login)
			expect(redirectURI).toContain("/login");
			expect(redirectURI).toContain("client_id=" + application.clientId);
		});

		it("should not force re-authentication when session age is within max_age", async ({
			expect,
		}) => {
			const authUrl = new URL(
				"http://localhost:3000/api/auth/oauth2/authorize",
			);
			authUrl.searchParams.set("client_id", application.clientId);
			authUrl.searchParams.set(
				"redirect_uri",
				application.redirectUrls[0] || "",
			);
			authUrl.searchParams.set("response_type", "code");
			authUrl.searchParams.set("scope", "openid profile email");
			authUrl.searchParams.set("state", "test-state");
			authUrl.searchParams.set("max_age", "3600"); // 1 hour - should be valid
			authUrl.searchParams.set("code_challenge", "test-challenge");
			authUrl.searchParams.set("code_challenge_method", "S256");

			let redirectURI = "";
			await serverClient.$fetch(authUrl.toString(), {
				method: "GET",
				onError(context) {
					redirectURI = context.response.headers.get("Location") || "";
				},
			});

			// Should either succeed with code or redirect to consent (but NOT to login)
			expect(redirectURI).not.toContain("/login");
			// It should either have a code or consent_code
			expect(
				redirectURI.includes("code=") || redirectURI.includes("consent_code="),
			).toBe(true);
		});
	});

	describe("cookie persistence bug (issue #4594)", () => {
		// Reproduce issue #4594: oidc_login_prompt cookie persists after OIDC flow
		// and causes subsequent normal logins to redirect to OIDC client
		it("should not redirect to OIDC client on subsequent normal logins", async ({
			expect,
		}) => {
			// Step 1: Create a new OAuth client for this test
			const testClient = await serverClient.oauth2.register({
				client_name: "test-cookie-persistence",
				redirect_uris: [
					"http://localhost:3000/api/auth/oauth2/callback/test-persist",
				],
			});

			// Step 2: Logout to start fresh
			await serverClient.signOut({
				fetchOptions: {
					throw: false,
				},
			});

			// Step 3: Initiate OIDC authorization flow (which will set oidc_login_prompt cookie)
			const authUrl = new URL(
				"http://localhost:3000/api/auth/oauth2/authorize",
			);
			authUrl.searchParams.set("client_id", testClient.data?.client_id || "");
			authUrl.searchParams.set(
				"redirect_uri",
				testClient.data?.redirect_uris[0] || "",
			);
			authUrl.searchParams.set("response_type", "code");
			authUrl.searchParams.set("scope", "openid profile email");
			authUrl.searchParams.set("state", "test-state");
			authUrl.searchParams.set("code_challenge", "test-challenge");
			authUrl.searchParams.set("code_challenge_method", "S256");

			const oidcHeaders = new Headers();
			let redirectURI = "";

			await customFetchImpl(authUrl.toString(), {
				method: "GET",
				redirect: "manual",
			}).then((res) => {
				redirectURI = res.headers.get("Location") || "";
				// Capture the oidc_login_prompt cookie
				const setCookie = res.headers.get("set-cookie");
				if (setCookie) {
					oidcHeaders.set("Cookie", setCookie);
				}
			});

			// Should redirect to login and set oidc_login_prompt cookie
			expect(redirectURI).toContain("/login");
			expect(oidcHeaders.get("Cookie")).toContain("oidc_login_prompt");

			// Step 4: Complete the OIDC login flow
			await customFetchImpl("http://localhost:3000/api/auth/sign-in/email", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: oidcHeaders.get("Cookie") || "",
				},
				body: JSON.stringify({
					email: testUser.email,
					password: testUser.password,
				}),
				redirect: "manual",
			}).then((res) => {
				redirectURI = res.headers.get("Location") || "";
				// Update cookies with session
				const setCookie = res.headers.get("set-cookie");
				if (setCookie) {
					const existing = oidcHeaders.get("Cookie") || "";
					oidcHeaders.set(
						"Cookie",
						existing ? `${existing}; ${setCookie}` : setCookie,
					);
				}
			});

			// Should redirect to consent or client callback (OIDC flow continues)
			expect(redirectURI).not.toContain("/login");

			// Step 5: Now do a NORMAL login to the main app (NOT OIDC flow)
			// This simulates a user later logging into the main app directly
			// The bug was that oidc_login_prompt cookie would still be present
			// and cause a redirect to the OIDC client
			const normalLoginHeaders = new Headers();
			let normalLoginRedirect = "";

			await customFetchImpl("http://localhost:3000/api/auth/sign-in/email", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					email: testUser.email,
					password: testUser.password,
				}),
				redirect: "manual",
			}).then((res) => {
				normalLoginRedirect = res.headers.get("Location") || "";
				const setCookie = res.headers.get("set-cookie");
				if (setCookie) {
					normalLoginHeaders.set("Cookie", setCookie);
				}
			});

			expect(normalLoginRedirect).not.toContain("oauth2/callback");
			expect(normalLoginRedirect).not.toContain(
				testClient.data?.redirect_uris[0] || "",
			);
		});
	});

	describe("end session endpoint", () => {
		it("should return end_session_endpoint in metadata", async ({ expect }) => {
			const response: any = await serverClient.$fetch(
				"/.well-known/openid-configuration",
				{
					method: "GET",
				},
			);
			const metadata = response.data || response;
			expect(metadata.end_session_endpoint).toBe(
				"http://localhost:3000/api/auth/oauth2/endsession",
			);
		});

		it("should logout successfully without parameters", async ({ expect }) => {
			const response = await serverClient.$fetch("/oauth2/endsession", {
				method: "GET",
			});
			expect(response.data).toMatchObject({
				success: true,
				message: "Logout successful",
			});
		});

		it("should logout with post_logout_redirect_uri and state", async ({
			expect,
		}) => {
			let redirectLocation = "";
			await serverClient.$fetch(
				`/oauth2/endsession?client_id=${application.clientId}&post_logout_redirect_uri=${encodeURIComponent(application.redirectUrls[0]!)}&state=test-state`,
				{
					method: "GET",
					onError(context) {
						redirectLocation = context.response.headers.get("Location") || "";
					},
				},
			);
			expect(redirectLocation).toContain(application.redirectUrls[0]);
			expect(redirectLocation).toContain("state=test-state");
		});

		it("should fail with invalid client_id", async ({ expect }) => {
			const response = await serverClient.$fetch(
				"/oauth2/endsession?client_id=invalid-client",
				{
					method: "GET",
				},
			);
			expect(response.error).toMatchObject({
				error: "invalid_client",
				error_description: "Invalid client_id",
			});
		});

		it("should fail with post_logout_redirect_uri without client_id", async ({
			expect,
		}) => {
			const response = await serverClient.$fetch(
				`/oauth2/endsession?post_logout_redirect_uri=${encodeURIComponent("http://localhost:3000/callback")}`,
				{
					method: "GET",
				},
			);
			expect(response.error).toMatchObject({
				error: "invalid_request",
				error_description: expect.stringContaining("client_id is required"),
			});
		});

		it("should fail with unregistered post_logout_redirect_uri", async ({
			expect,
		}) => {
			const response = await serverClient.$fetch(
				`/oauth2/endsession?client_id=${application.clientId}&post_logout_redirect_uri=${encodeURIComponent("http://evil.com/callback")}`,
				{
					method: "GET",
				},
			);
			expect(response.error).toMatchObject({
				error: "invalid_request",
				error_description: expect.stringContaining("not registered"),
			});
		});

		it("should support POST method", async ({ expect }) => {
			const response = await serverClient.$fetch("/oauth2/endsession", {
				method: "POST",
			});
			expect(response.data).toMatchObject({
				success: true,
				message: "Logout successful",
			});
		});
	});
});

describe("oidc storage", async () => {
	let server: Listener;

	afterEach(async () => {
		if (server) {
			await server.close();
		}
	});

	test.each([
		{
			storeClientSecret: undefined,
		},
		{
			storeClientSecret: "hashed",
		},
		{
			storeClientSecret: "encrypted",
		},
	] as const)("OIDC base test", async ({ storeClientSecret }) => {
		const {
			auth: authorizationServer,
			signInWithTestUser,
			customFetchImpl,
		} = await getTestInstance({
			baseURL: "http://localhost:3000",
			plugins: [
				oidcProvider({
					loginPage: "/login",
					consentPage: "/oauth2/authorize",
					requirePKCE: true,
					getAdditionalUserInfoClaim(user) {
						return {
							custom: "custom value",
							userId: user.id,
						};
					},
					storeClientSecret,
				}),
				jwt(),
			],
		});
		const { headers } = await signInWithTestUser();
		const serverClient = createAuthClient({
			plugins: [oidcClient()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers,
			},
		});

		server = await listen(toNodeHandler(authorizationServer.handler), {
			port: 3000,
		});

		let application: Client = {
			clientId: "test-client-id",
			clientSecret: "test-client-secret-oidc",
			redirectUrls: ["http://localhost:3000/api/auth/oauth2/callback/test"],
			metadata: {},
			icon: "",
			type: "web",
			disabled: false,
			name: "test",
		};
		const createdClient = await serverClient.oauth2.register({
			client_name: application.name,
			redirect_uris: application.redirectUrls,
			logo_uri: application.icon,
		});
		expect(createdClient.data).toMatchObject({
			client_id: expect.any(String),
			client_secret: expect.any(String),
			client_name: "test",
			logo_uri: "",
			redirect_uris: ["http://localhost:3000/api/auth/oauth2/callback/test"],
			grant_types: ["authorization_code"],
			response_types: ["code"],
			token_endpoint_auth_method: "client_secret_basic",
			client_id_issued_at: expect.any(Number),
			client_secret_expires_at: 0,
		});
		if (createdClient.data) {
			application = {
				clientId: createdClient.data.client_id,
				clientSecret: createdClient.data.client_secret,
				redirectUrls: createdClient.data.redirect_uris,
				metadata: {},
				icon: createdClient.data.logo_uri || "",
				type: "web",
				disabled: false,
				name: createdClient.data.client_name || "",
			};
		}
		// The RP (Relying Party) - the client application
		const { customFetchImpl: customFetchImplRP, cookieSetter } =
			await getTestInstance({
				account: {
					accountLinking: {
						trustedProviders: ["test"],
					},
				},
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "test",
								clientId: application.clientId,
								clientSecret: application.clientSecret || "",
								authorizationUrl:
									"http://localhost:3000/api/auth/oauth2/authorize",
								tokenUrl: "http://localhost:3000/api/auth/oauth2/token",
								scopes: ["openid", "profile", "email"],
								pkce: true,
							},
						],
					}),
				],
			});

		const client = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: "http://localhost:5000",
			fetchOptions: {
				customFetchImpl: customFetchImplRP,
			},
		});
		const oAuthHeaders = new Headers();
		const data = await client.signIn.oauth2(
			{
				providerId: "test",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
				onSuccess: cookieSetter(oAuthHeaders),
			},
		);
		expect(data.url).toContain(
			"http://localhost:3000/api/auth/oauth2/authorize",
		);
		expect(data.url).toContain(`client_id=${application.clientId}`);

		let redirectURI = "";
		const newHeaders = new Headers();
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				redirectURI = context.response.headers.get("Location") || "";
				cookieSetter(newHeaders)(context);
				// Note: headers might be available from parent scope (serverClient auth)
				// newHeaders already has the consent cookies
			},
		});

		// Handle consent flow if required (per OIDC spec for non-trusted clients)
		redirectURI = await handleConsentFlow(
			redirectURI,
			serverClient,
			headers,
			newHeaders,
		);

		// Verify we got an authorization code
		expect(redirectURI).toContain(
			"http://localhost:3000/api/auth/oauth2/callback/test?code=",
		);

		let callbackURL = "";
		await client.$fetch(redirectURI, {
			headers: oAuthHeaders,
			onError(context) {
				callbackURL = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackURL).toContain("/dashboard");
	});
});

describe("oidc token response format", async () => {
	async function setupOAuthFlowAndGetCode(scopes: string[]) {
		const {
			auth: authorizationServer,
			signInWithTestUser,
			customFetchImpl,
		} = await getTestInstance({
			baseURL: "http://localhost:3000",
			plugins: [
				oidcProvider({
					loginPage: "/login",
					consentPage: "/oauth2/authorize",
					requirePKCE: false,
				}),
				jwt(),
			],
		});
		const { headers } = await signInWithTestUser();
		const serverClient = createAuthClient({
			plugins: [oidcClient()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers,
			},
		});

		const server = await listen(toNodeHandler(authorizationServer.handler), {
			port: 3000,
		});

		const createdClient = await serverClient.oauth2.register({
			client_name: "test-app",
			redirect_uris: ["http://localhost:3000/api/auth/oauth2/callback/test"],
			logo_uri: "",
		});

		const application = {
			clientId: createdClient.data!.client_id,
			clientSecret: createdClient.data!.client_secret,
		};

		const { customFetchImpl: customFetchImplRP, cookieSetter } =
			await getTestInstance({
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "test",
								clientId: application.clientId,
								clientSecret: application.clientSecret,
								authorizationUrl:
									"http://localhost:3000/api/auth/oauth2/authorize",
								tokenUrl: "http://localhost:3000/api/auth/oauth2/token",
								scopes,
								pkce: false,
							},
						],
					}),
				],
			});

		const client = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: "http://localhost:5000",
			fetchOptions: {
				customFetchImpl: customFetchImplRP,
			},
		});
		const oAuthHeaders = new Headers();
		const data = await client.signIn.oauth2(
			{
				providerId: "test",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
				onSuccess: cookieSetter(oAuthHeaders),
			},
		);

		let redirectURI = "";
		const consentHeaders = new Headers();
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				redirectURI = context.response.headers.get("Location") || "";
				cookieSetter(consentHeaders)(context);
			},
		});

		redirectURI = await handleConsentFlow(
			redirectURI,
			serverClient,
			headers,
			consentHeaders,
		);

		const url = new URL(redirectURI);
		const code = url.searchParams.get("code")!;

		return {
			server,
			customFetchImpl,
			application,
			code,
		};
	}

	it("should return Bearer token_type in authorization_code token response", async ({
		expect,
	}) => {
		const { server, customFetchImpl, application, code } =
			await setupOAuthFlowAndGetCode(["openid", "profile", "email"]);

		const tokenResponse = await customFetchImpl(
			"http://localhost:3000/api/auth/oauth2/token",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					grant_type: "authorization_code",
					code,
					redirect_uri: "http://localhost:3000/api/auth/oauth2/callback/test",
					client_id: application.clientId,
					client_secret: application.clientSecret,
				}),
			},
		);

		const tokenData = await tokenResponse.json();

		expect(tokenData.token_type).toBe("Bearer");
		expect(tokenData.access_token).toBeDefined();
		expect(tokenData.expires_in).toBeDefined();
		expect(tokenData.id_token).toBeDefined();
		expect(tokenData.scope).toBeDefined();

		await server.close();
	});

	it("should return Bearer token_type in refresh_token grant response", async ({
		expect,
	}) => {
		const { server, customFetchImpl, application, code } =
			await setupOAuthFlowAndGetCode([
				"openid",
				"profile",
				"email",
				"offline_access",
			]);

		const initialTokenResponse = await customFetchImpl(
			"http://localhost:3000/api/auth/oauth2/token",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					grant_type: "authorization_code",
					code,
					redirect_uri: "http://localhost:3000/api/auth/oauth2/callback/test",
					client_id: application.clientId,
					client_secret: application.clientSecret,
				}),
			},
		);

		const initialTokenData = await initialTokenResponse.json();
		expect(initialTokenData.refresh_token).toBeDefined();
		expect(initialTokenData.token_type).toBe("Bearer");

		const refreshTokenResponse = await customFetchImpl(
			"http://localhost:3000/api/auth/oauth2/token",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					grant_type: "refresh_token",
					refresh_token: initialTokenData.refresh_token,
					client_id: application.clientId,
					client_secret: application.clientSecret,
				}),
			},
		);

		const refreshTokenData = await refreshTokenResponse.json();

		expect(refreshTokenData.token_type).toBe("Bearer");
		expect(refreshTokenData.access_token).toBeDefined();
		expect(refreshTokenData.expires_in).toBeDefined();
		expect(refreshTokenData.refresh_token).toBeDefined();
		expect(refreshTokenData.scope).toBeDefined();

		await server.close();
	});
});

describe("oidc-jwt", async () => {
	let server: Listener | null = null;

	afterEach(async () => {
		if (server) {
			await server.close();
			server = null;
		}
	});

	test.each([
		{ useJwt: true, description: "with jwt plugin", expected: "EdDSA" },
		{ useJwt: false, description: "without jwt plugin", expected: "HS256" },
	])("testing oidc-provider $description to return token signed with $expected", async ({
		useJwt,
		expected,
	}) => {
		const {
			auth: authorizationServer,
			signInWithTestUser,
			customFetchImpl,
			testUser,
		} = await getTestInstance({
			baseURL: "http://localhost:3000",
			plugins: [
				oidcProvider({
					loginPage: "/login",
					consentPage: "/oauth2/authorize",
					requirePKCE: true,
					getAdditionalUserInfoClaim(user) {
						return {
							custom: "custom value",
							userId: user.id,
						};
					},
					useJWTPlugin: useJwt,
				}),
				...(useJwt ? [jwt()] : []),
			],
		});
		const { headers } = await signInWithTestUser();
		const serverClient = createAuthClient({
			plugins: [oidcClient()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers,
			},
		});
		server = await listen(toNodeHandler(authorizationServer.handler), {
			port: 3000,
		});
		let application: Client = {
			clientId: "test-client-id",
			clientSecret: "test-client-secret-oidc",
			redirectUrls: ["http://localhost:3000/api/auth/oauth2/callback/test"],
			metadata: {},
			icon: "",
			type: "web",
			disabled: false,
			name: "test",
		};
		const createdClient = await serverClient.oauth2.register({
			client_name: application.name,
			redirect_uris: application.redirectUrls,
			logo_uri: application.icon,
		});
		expect(createdClient.data).toMatchObject({
			client_id: expect.any(String),
			client_secret: expect.any(String),
			client_name: "test",
			logo_uri: "",
			redirect_uris: ["http://localhost:3000/api/auth/oauth2/callback/test"],
			grant_types: ["authorization_code"],
			response_types: ["code"],
			token_endpoint_auth_method: "client_secret_basic",
			client_id_issued_at: expect.any(Number),
			client_secret_expires_at: 0,
		});
		if (createdClient.data) {
			application = {
				clientId: createdClient.data.client_id,
				clientSecret: createdClient.data.client_secret,
				redirectUrls: createdClient.data.redirect_uris,
				metadata: {},
				icon: createdClient.data.logo_uri || "",
				type: "web",
				disabled: false,
				name: createdClient.data.client_name || "",
			};
		}

		// The RP (Relying Party) - the client application
		const { customFetchImpl: customFetchImplRP, cookieSetter } =
			await getTestInstance({
				account: {
					accountLinking: {
						trustedProviders: ["test"],
					},
				},
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "test",
								clientId: application.clientId,
								clientSecret: application.clientSecret || "",
								authorizationUrl:
									"http://localhost:3000/api/auth/oauth2/authorize",
								tokenUrl: "http://localhost:3000/api/auth/oauth2/token",
								scopes: ["openid", "profile", "email"],
								pkce: true,
							},
						],
					}),
				],
			});

		const client = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: "http://localhost:5000",
			fetchOptions: {
				customFetchImpl: customFetchImplRP,
			},
		});
		const oAuthHeaders = new Headers();
		const data = await client.signIn.oauth2(
			{
				providerId: "test",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
				onSuccess: cookieSetter(oAuthHeaders),
			},
		);
		expect(data.url).toContain(
			"http://localhost:3000/api/auth/oauth2/authorize",
		);
		expect(data.url).toContain(`client_id=${application.clientId}`);

		let redirectURI = "";
		const newHeaders = new Headers();
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				redirectURI = context.response.headers.get("Location") || "";
				cookieSetter(newHeaders)(context);
				if (headers.get("Cookie")) {
					newHeaders.append("Cookie", headers.get("Cookie") || "");
				}
			},
		});

		// Check if consent is needed (per OIDC spec)
		if (redirectURI.includes("consent_code=")) {
			// Handle consent flow - this is expected per OIDC spec for non-trusted clients
			expect(redirectURI).toContain("/oauth2/authorize?");
			expect(redirectURI).toContain("consent_code=");
			expect(redirectURI).toContain("client_id=");

			// Extract consent_code from URL
			const url = new URL(redirectURI, "http://localhost:3000");
			const consentCode = url.searchParams.get("consent_code");

			const res = await serverClient.oauth2.consent(
				{
					accept: true,
					consent_code: consentCode,
				},
				{
					headers: newHeaders,
					throw: true,
				},
			);
			expect(res.redirectURI).toContain(
				"http://localhost:3000/api/auth/oauth2/callback/test?code=",
			);
			redirectURI = res.redirectURI;
		} else {
			// Direct code response (trusted client)
			expect(redirectURI).toContain(
				"http://localhost:3000/api/auth/oauth2/callback/test?code=",
			);
		}
		let authToken = undefined;
		let callbackURL = "";
		await client.$fetch(redirectURI, {
			headers: oAuthHeaders,
			onError(context) {
				callbackURL = context.response.headers.get("Location") || "";
				authToken = context.response.headers.get("set-auth-token")!;
			},
		});
		expect(callbackURL).toContain("/dashboard");
		const accessToken = await client.getAccessToken(
			{ providerId: "test", userId: testUser.id },
			{
				auth: {
					type: "Bearer",
					token: authToken,
				},
			},
		);
		const decoded = decodeProtectedHeader(accessToken.data?.idToken!);
		if (useJwt) {
			const jwks = await authorizationServer.api.getJwks();
			const jwkSet = createLocalJWKSet(jwks);
			const checkSignature = await jwtVerify(
				accessToken.data?.idToken!,
				jwkSet,
			);
			expect(checkSignature).toBeDefined();
			expect(Number.isInteger(checkSignature.payload.iat)).toBeTruthy();
			expect(Number.isInteger(checkSignature.payload.exp)).toBeTruthy();
		} else {
			const clientSecret = application.clientSecret;
			const checkSignature = await jwtVerify(
				accessToken.data?.idToken!,
				new TextEncoder().encode(clientSecret),
			);
			expect(checkSignature).toBeDefined();
		}

		// expect(checkSignature.payload).toBeDefined();
		expect(decoded.alg).toBe(expected);
	});
});
