import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import { type Listener, listen } from "listhen";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	test,
} from "vitest";
import { type AuthClient, createAuthClient } from "../../client";
import { toNodeHandler } from "../../integrations/node";
import { getTestInstance } from "../../test-utils/test-instance";
import { genericOAuth } from "../generic-oauth";
import { genericOAuthClient } from "../generic-oauth/client";
import { jwt } from "../jwt";
import { oidcProvider } from ".";
import { type OidcClientPlugin, oidcClient } from "./client";
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
	])(
		"testing oidc-provider $description to return token signed with $expected",
		async ({ useJwt, expected }) => {
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
		},
	);
});
