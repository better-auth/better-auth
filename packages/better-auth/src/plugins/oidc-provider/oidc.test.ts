import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	test,
} from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { oidcProvider } from ".";
import { genericOAuth } from "../generic-oauth";
import type { Client } from "./types";
import { createAuthClient } from "../../client";
import { oidcClient } from "./client";
import { genericOAuthClient } from "../generic-oauth/client";
import { listen, type Listener } from "listhen";
import { toNodeHandler } from "../../integrations/node";
import { jwt } from "../jwt";
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from "jose";

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
				getAdditionalUserInfoClaim(user, scopes, client) {
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
		redirectURLs: ["http://localhost:3000/api/auth/oauth2/callback/test"],
		metadata: {},
		icon: "",
		type: "web",
		disabled: false,
		name: "test",
	};

	it("should create oidc client", async ({ expect }) => {
		const createdClient = await serverClient.oauth2.register({
			client_name: application.name,
			redirect_uris: application.redirectURLs,
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
				redirectURLs: createdClient.data.redirect_uris,
				metadata: {},
				icon: createdClient.data.logo_uri || "",
				type: "web",
				disabled: false,
				name: createdClient.data.client_name || "",
			};
		}
	});

	it("should sign in the user with the provider", async ({ expect }) => {
		// The RP (Relying Party) - the client application
		const { customFetchImpl: customFetchImplRP } = await getTestInstance({
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
		const data = await client.signIn.oauth2(
			{
				providerId: "test",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
			},
		);
		expect(data.url).toContain(
			"http://localhost:3000/api/auth/oauth2/authorize",
		);
		expect(data.url).toContain(`client_id=${application.clientId}`);

		let redirectURI = "";
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				redirectURI = context.response.headers.get("Location") || "";
			},
		});
		expect(redirectURI).toContain(
			"http://localhost:3000/api/auth/oauth2/callback/test?code=",
		);

		let callbackURL = "";
		await client.$fetch(redirectURI, {
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
		const data = await client.signIn.oauth2(
			{
				providerId: "test",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
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
		const data = await client.signIn.oauth2(
			{
				providerId: "test",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
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
			testUser,
		} = await getTestInstance({
			baseURL: "http://localhost:3000",
			plugins: [
				oidcProvider({
					loginPage: "/login",
					consentPage: "/oauth2/authorize",
					requirePKCE: true,
					getAdditionalUserInfoClaim(user, scopes, client) {
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
			redirectURLs: ["http://localhost:3000/api/auth/oauth2/callback/test"],
			metadata: {},
			icon: "",
			type: "web",
			disabled: false,
			name: "test",
		};
		const createdClient = await serverClient.oauth2.register({
			client_name: application.name,
			redirect_uris: application.redirectURLs,
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
				redirectURLs: createdClient.data.redirect_uris,
				metadata: {},
				icon: createdClient.data.logo_uri || "",
				type: "web",
				disabled: false,
				name: createdClient.data.client_name || "",
			};
		}
		// The RP (Relying Party) - the client application
		const { customFetchImpl: customFetchImplRP } = await getTestInstance({
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
		const data = await client.signIn.oauth2(
			{
				providerId: "test",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
			},
		);
		expect(data.url).toContain(
			"http://localhost:3000/api/auth/oauth2/authorize",
		);
		expect(data.url).toContain(`client_id=${application.clientId}`);

		let redirectURI = "";
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				redirectURI = context.response.headers.get("Location") || "";
			},
		});
		expect(redirectURI).toContain(
			"http://localhost:3000/api/auth/oauth2/callback/test?code=",
		);

		let callbackURL = "";
		await client.$fetch(redirectURI, {
			onError(context) {
				callbackURL = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackURL).toContain("/dashboard");
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
		async ({ useJwt, description, expected }) => {
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
						getAdditionalUserInfoClaim(user, scopes, client) {
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
				redirectURLs: ["http://localhost:3000/api/auth/oauth2/callback/test"],
				metadata: {},
				icon: "",
				type: "web",
				disabled: false,
				name: "test",
			};
			const createdClient = await serverClient.oauth2.register({
				client_name: application.name,
				redirect_uris: application.redirectURLs,
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
					redirectURLs: createdClient.data.redirect_uris,
					metadata: {},
					icon: createdClient.data.logo_uri || "",
					type: "web",
					disabled: false,
					name: createdClient.data.client_name || "",
				};
			}

			// The RP (Relying Party) - the client application
			const { customFetchImpl: customFetchImplRP } = await getTestInstance({
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
			const data = await client.signIn.oauth2(
				{
					providerId: "test",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
				},
			);
			expect(data.url).toContain(
				"http://localhost:3000/api/auth/oauth2/authorize",
			);
			expect(data.url).toContain(`client_id=${application.clientId}`);

			let redirectURI = "";
			await serverClient.$fetch(data.url, {
				method: "GET",
				onError(context) {
					redirectURI = context.response.headers.get("Location") || "";
				},
			});
			expect(redirectURI).toContain(
				"http://localhost:3000/api/auth/oauth2/callback/test?code=",
			);
			let authToken = undefined;
			let callbackURL = "";
			await client.$fetch(redirectURI, {
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
