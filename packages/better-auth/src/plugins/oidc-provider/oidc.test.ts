import { afterAll, beforeAll, describe, it, vi } from "vitest";
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
				getAdditionalUserInfoClaim(user, scopes) {
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
							clientSecret: application.clientSecret,
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
								clientSecret: application.clientSecret,
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
		expect(redirectURI).toContain("/oauth2/authorize?client_id=");
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
								clientSecret: application.clientSecret,
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

	describe("client secret storage methods", async () => {
		// Testing hashed client secrets
		describe("hashed", async () => {
			const {
				auth: hashTestAuth,
				signInWithTestUser: hashSignInWithTestUser,
				customFetchImpl: hashCustomFetchImpl,
			} = await getTestInstance({
				baseURL: "http://localhost:3001",
				plugins: [
					oidcProvider({
						loginPage: "/login",
						consentPage: "/oauth2/authorize",
						storeClientSecret: "hashed",
					}),
					jwt(),
				],
			});

			const { headers: hashHeaders } = await hashSignInWithTestUser();
			const hashServerClient = createAuthClient({
				plugins: [oidcClient()],
				baseURL: "http://localhost:3001",
				fetchOptions: {
					customFetchImpl: hashCustomFetchImpl,
					headers: hashHeaders,
				},
			});

			let hashServer: Listener;
			let hashedApplication: Client;

			beforeAll(async () => {
				hashServer = await listen(toNodeHandler(hashTestAuth.handler), {
					port: 3001,
				});
			});

			afterAll(async () => {
				await hashServer.close();
			});

			it("should create client with hashed secret", async ({ expect }) => {
				const createdClient = await hashServerClient.oauth2.register({
					client_name: "hashed-test",
					redirect_uris: [
						"http://localhost:3001/api/auth/oauth2/callback/test",
					],
				});

				expect(createdClient.data).toMatchObject({
					client_id: expect.any(String),
					client_secret: expect.any(String),
					client_name: "hashed-test",
				});

				if (createdClient.data) {
					hashedApplication = {
						clientId: createdClient.data.client_id,
						clientSecret: createdClient.data.client_secret,
						redirectURLs: createdClient.data.redirect_uris,
						metadata: {},
						icon: createdClient.data.logo_uri || "",
						type: "web",
						disabled: false,
						name: createdClient.data.client_name || "",
					};

					// Verify the secret is stored hashed in the database
					const authCtx = await hashTestAuth.$context;
					const dbClient = await authCtx.adapter.findOne<{
						clientSecret: string;
					}>({
						model: "oauthApplication",
						where: [{ field: "clientId", value: createdClient.data.client_id }],
					});

					if (!dbClient) {
						throw new Error("Client not found");
					}
					expect(dbClient.clientSecret).not.toBe(
						createdClient.data.client_secret,
					);
					expect(dbClient.clientSecret.length).toBeGreaterThan(0);
				}
			});

			it("should authenticate with hashed client secret", async ({
				expect,
			}) => {
				// Test token exchange with hashed client secret
				const tokenResponse = await hashCustomFetchImpl(
					`http://localhost:3001/api/auth/oauth2/token`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/x-www-form-urlencoded",
							Authorization: `Basic ${btoa(
								`${hashedApplication.clientId}:${hashedApplication.clientSecret}`,
							)}`,
						},
						body: new URLSearchParams({
							grant_type: "authorization_code",
							code: "dummy-code-for-validation-test",
							redirect_uri: hashedApplication.redirectURLs[0],
						}).toString(),
					},
				);

				// We expect this to fail with invalid code, but it should pass client authentication
				const response = await tokenResponse.json();
				expect(response.error).not.toBe("invalid_client");
			});
		});

		// Testing encrypted client secrets
		describe("encrypted", async () => {
			const {
				auth: encryptTestAuth,
				signInWithTestUser: encryptSignInWithTestUser,
				customFetchImpl: encryptCustomFetchImpl,
			} = await getTestInstance({
				baseURL: "http://localhost:3002",
				plugins: [
					oidcProvider({
						loginPage: "/login",
						consentPage: "/oauth2/authorize",
						storeClientSecret: "encrypted",
					}),
					jwt(),
				],
			});

			const { headers: encryptHeaders } = await encryptSignInWithTestUser();
			const encryptServerClient = createAuthClient({
				plugins: [oidcClient()],
				baseURL: "http://localhost:3002",
				fetchOptions: {
					customFetchImpl: encryptCustomFetchImpl,
					headers: encryptHeaders,
				},
			});

			let encryptServer: Listener;
			let encryptedApplication: Client;

			beforeAll(async () => {
				encryptServer = await listen(toNodeHandler(encryptTestAuth.handler), {
					port: 3002,
				});
			});

			afterAll(async () => {
				await encryptServer.close();
			});

			it("should create client with encrypted secret", async ({ expect }) => {
				const createdClient = await encryptServerClient.oauth2.register({
					client_name: "encrypted-test",
					redirect_uris: [
						"http://localhost:3002/api/auth/oauth2/callback/test",
					],
				});

				expect(createdClient.data).toMatchObject({
					client_id: expect.any(String),
					client_secret: expect.any(String),
					client_name: "encrypted-test",
				});

				if (createdClient.data) {
					encryptedApplication = {
						clientId: createdClient.data.client_id,
						clientSecret: createdClient.data.client_secret,
						redirectURLs: createdClient.data.redirect_uris,
						metadata: {},
						icon: createdClient.data.logo_uri || "",
						type: "web",
						disabled: false,
						name: createdClient.data.client_name || "",
					};

					// Verify the secret is stored encrypted in the database
					const authCtx = await encryptTestAuth.$context;
					const dbClient = await authCtx.adapter.findOne<{
						clientSecret: string;
					}>({
						model: "oauthApplication",
						where: [{ field: "clientId", value: createdClient.data.client_id }],
					});

					if (!dbClient) {
						throw new Error("Client not found");
					}
					expect(dbClient.clientSecret).not.toBe(
						createdClient.data.client_secret,
					);
					expect(dbClient.clientSecret.length).toBeGreaterThan(0);
				}
			});

			it("should authenticate with encrypted client secret", async ({
				expect,
			}) => {
				// Test token exchange with encrypted client secret
				const tokenResponse = await encryptCustomFetchImpl(
					`http://localhost:3002/api/auth/oauth2/token`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/x-www-form-urlencoded",
							Authorization: `Basic ${btoa(
								`${encryptedApplication.clientId}:${encryptedApplication.clientSecret}`,
							)}`,
						},
						body: new URLSearchParams({
							grant_type: "authorization_code",
							code: "dummy-code-for-validation-test",
							redirect_uri: encryptedApplication.redirectURLs[0],
						}).toString(),
					},
				);

				// We expect this to fail with invalid code, but it should pass client authentication
				const response = await tokenResponse.json();
				expect(response.error).not.toBe("invalid_client");
			});
		});

		// Testing custom hash function
		describe("custom hasher", async () => {
			const customHash = vi.fn(
				async (secret: string) => `custom-hash-${secret}`,
			);

			const {
				auth: customHashTestAuth,
				signInWithTestUser: customHashSignInWithTestUser,
				customFetchImpl: customHashCustomFetchImpl,
			} = await getTestInstance({
				baseURL: "http://localhost:3003",
				plugins: [
					oidcProvider({
						loginPage: "/login",
						consentPage: "/oauth2/authorize",
						storeClientSecret: {
							hash: customHash,
						},
					}),
					jwt(),
				],
			});

			const { headers: customHashHeaders } =
				await customHashSignInWithTestUser();
			const customHashServerClient = createAuthClient({
				plugins: [oidcClient()],
				baseURL: "http://localhost:3003",
				fetchOptions: {
					customFetchImpl: customHashCustomFetchImpl,
					headers: customHashHeaders,
				},
			});

			let customHashServer: Listener;
			let customHashApplication: Client;

			beforeAll(async () => {
				customHashServer = await listen(
					toNodeHandler(customHashTestAuth.handler),
					{
						port: 3003,
					},
				);
			});

			afterAll(async () => {
				await customHashServer.close();
			});

			it("should create client with custom hashed secret", async ({
				expect,
			}) => {
				const createdClient = await customHashServerClient.oauth2.register({
					client_name: "custom-hash-test",
					redirect_uris: [
						"http://localhost:3003/api/auth/oauth2/callback/test",
					],
				});

				expect(createdClient.data).toMatchObject({
					client_id: expect.any(String),
					client_secret: expect.any(String),
					client_name: "custom-hash-test",
				});

				if (createdClient.data) {
					customHashApplication = {
						clientId: createdClient.data.client_id,
						clientSecret: createdClient.data.client_secret,
						redirectURLs: createdClient.data.redirect_uris,
						metadata: {},
						icon: createdClient.data.logo_uri || "",
						type: "web",
						disabled: false,
						name: createdClient.data.client_name || "",
					};

					// Verify the custom hash function was called
					expect(customHash).toHaveBeenCalledWith(
						createdClient.data.client_secret,
					);

					// Verify the secret is stored with custom hash in the database
					const authCtx = await customHashTestAuth.$context;
					const dbClient = await authCtx.adapter.findOne<{
						clientSecret: string;
					}>({
						model: "oauthApplication",
						where: [{ field: "clientId", value: createdClient.data.client_id }],
					});

					if (!dbClient) {
						throw new Error("Client not found");
					}
					expect(dbClient.clientSecret).toBe(
						`custom-hash-${createdClient.data.client_secret}`,
					);
				}
			});

			it("should authenticate with custom hashed client secret", async ({
				expect,
			}) => {
				// Test token exchange with custom hashed client secret
				const tokenResponse = await customHashCustomFetchImpl(
					`http://localhost:3003/api/auth/oauth2/token`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/x-www-form-urlencoded",
							Authorization: `Basic ${btoa(
								`${customHashApplication.clientId}:${customHashApplication.clientSecret}`,
							)}`,
						},
						body: new URLSearchParams({
							grant_type: "authorization_code",
							code: "dummy-code-for-validation-test",
							redirect_uri: customHashApplication.redirectURLs[0],
						}).toString(),
					},
				);

				// We expect this to fail with invalid code, but it should pass client authentication
				const response = await tokenResponse.json();
				expect(response.error).not.toBe("invalid_client");

				// Verify hash function was called for verification
				expect(customHash).toHaveBeenCalledTimes(2); // Once for storing, once for verifying
			});
		});

		// Testing custom encrypt/decrypt functions
		describe("custom encryptor", async () => {
			const customEncrypt = vi.fn(
				async (secret: string) => `encrypted-${secret}`,
			);
			const customDecrypt = vi.fn(async (encryptedSecret: string) =>
				encryptedSecret.replace("encrypted-", ""),
			);

			const {
				auth: customEncryptTestAuth,
				signInWithTestUser: customEncryptSignInWithTestUser,
				customFetchImpl: customEncryptCustomFetchImpl,
			} = await getTestInstance({
				baseURL: "http://localhost:3004",
				plugins: [
					oidcProvider({
						loginPage: "/login",
						consentPage: "/oauth2/authorize",
						storeClientSecret: {
							encrypt: customEncrypt,
							decrypt: customDecrypt,
						},
					}),
					jwt(),
				],
			});

			const { headers: customEncryptHeaders } =
				await customEncryptSignInWithTestUser();
			const customEncryptServerClient = createAuthClient({
				plugins: [oidcClient()],
				baseURL: "http://localhost:3004",
				fetchOptions: {
					customFetchImpl: customEncryptCustomFetchImpl,
					headers: customEncryptHeaders,
				},
			});

			let customEncryptServer: Listener;
			let customEncryptApplication: Client;

			beforeAll(async () => {
				customEncryptServer = await listen(
					toNodeHandler(customEncryptTestAuth.handler),
					{
						port: 3004,
					},
				);
			});

			afterAll(async () => {
				await customEncryptServer.close();
			});

			it("should create client with custom encrypted secret", async ({
				expect,
			}) => {
				const createdClient = await customEncryptServerClient.oauth2.register({
					client_name: "custom-encrypt-test",
					redirect_uris: [
						"http://localhost:3004/api/auth/oauth2/callback/test",
					],
				});

				expect(createdClient.data).toMatchObject({
					client_id: expect.any(String),
					client_secret: expect.any(String),
					client_name: "custom-encrypt-test",
				});

				if (createdClient.data) {
					customEncryptApplication = {
						clientId: createdClient.data.client_id,
						clientSecret: createdClient.data.client_secret,
						redirectURLs: createdClient.data.redirect_uris,
						metadata: {},
						icon: createdClient.data.logo_uri || "",
						type: "web",
						disabled: false,
						name: createdClient.data.client_name || "",
					};

					// Verify the custom encrypt function was called
					expect(customEncrypt).toHaveBeenCalledWith(
						createdClient.data.client_secret,
					);

					// Verify the secret is stored with custom encryption in the database
					const authCtx = await customEncryptTestAuth.$context;
					const dbClient = await authCtx.adapter.findOne<{
						clientSecret: string;
					}>({
						model: "oauthApplication",
						where: [{ field: "clientId", value: createdClient.data.client_id }],
					});

					if (!dbClient) {
						throw new Error("Client not found");
					}
					expect(dbClient.clientSecret).toBe(
						`encrypted-${createdClient.data.client_secret}`,
					);
				}
			});

			it("should authenticate with custom encrypted client secret", async ({
				expect,
			}) => {
				// Test token exchange with custom encrypted client secret
				const tokenResponse = await customEncryptCustomFetchImpl(
					`http://localhost:3004/api/auth/oauth2/token`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/x-www-form-urlencoded",
							Authorization: `Basic ${btoa(
								`${customEncryptApplication.clientId}:${customEncryptApplication.clientSecret}`,
							)}`,
						},
						body: new URLSearchParams({
							grant_type: "authorization_code",
							code: "dummy-code-for-validation-test",
							redirect_uri: customEncryptApplication.redirectURLs[0],
						}).toString(),
					},
				);

				// We expect this to fail with invalid code, but it should pass client authentication
				const response = await tokenResponse.json();
				expect(response.error).not.toBe("invalid_client");

				// Verify decrypt function was called for verification
				expect(customDecrypt).toHaveBeenCalledWith(
					`encrypted-${customEncryptApplication.clientSecret}`,
				);
			});
		});
	});
});
