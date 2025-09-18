import { beforeAll, afterAll, afterEach, describe, it, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { oauthProvider } from "./oauth";
import { genericOAuth, type GenericOAuthConfig } from "../generic-oauth";
import type { OAuthClient } from "../../oauth-2.1/types";
import { createAuthClient } from "../../client";
import { oauthProviderClient } from "./client";
import { genericOAuthClient } from "../generic-oauth/client";
import { jwt } from "../jwt";
import { verifyAccessToken } from "./verify";
import { listen, type Listener } from "listhen";
import { toNodeHandler } from "../../integrations/node";
import { createLocalJWKSet, jwtVerify } from "jose";

describe("oauth - init", () => {
	it("should fail without the jwt plugin", async ({ expect }) => {
		await expect(
			getTestInstance({
				plugins: [
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
				],
			}),
		).rejects.toThrowError("jwt_config");
	});

	it("should pass without the jwt plugin and disableJwtPlugin set", async ({
		expect,
	}) => {
		await expect(
			getTestInstance({
				plugins: [
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						disableJwtPlugin: true,
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
				],
			}),
		).resolves.not.toThrowError();
	});

	it("should pass with correct plugins", async ({ expect }) => {
		await expect(
			getTestInstance({
				plugins: [
					jwt(),
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
				],
			}),
		).resolves.not.toThrowError();
	});
});

describe("oauth", async () => {
	const port = 3001;
	const authServerBaseUrl = `http://localhost:${port}`;
	const rpBaseUrl = "http://localhost:5000";
	const {
		auth: authorizationServer,
		signInWithTestUser,
		customFetchImpl,
		testUser,
	} = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				allowDynamicClientRegistration: true,
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
		],
	});

	const { headers } = await signInWithTestUser();
	const serverClient = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: {
			customFetchImpl,
			headers,
		},
	});

	let server: Listener;
	let oauthClient: OAuthClient | null;

	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;

	// Registers a confidential client application to work with
	beforeAll(async () => {
		// Opens the authorization server for testing with genericOAuth
		server = await listen(
			async (req, res) => {
				// Adds openid-config as the endpoint manually since server-endpoint
				if (req.url === "/.well-known/openid-configuration") {
					const config = await authorizationServer.api.getOpenIdConfig();
					res.setHeader("Content-Type", "application/json");
					res.end(JSON.stringify(config));
				} else {
					toNodeHandler(authorizationServer.handler)(req, res);
				}
			},
			{
				port,
			},
		);

		// This test is performed in register.test.ts
		const response = await serverClient.oauth2.register({
			redirect_uris: [redirectUri],
		});
		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.user_id).toBeDefined();
		expect(response.data?.client_secret).toBeDefined();
		expect(response.data?.redirect_uris).toEqual([redirectUri]);

		oauthClient = response.data;
	});

	afterAll(async () => {
		await server.close();
	});

	async function createTestInstance(
		config?: Omit<
			GenericOAuthConfig,
			"providerId" | "clientId" | "clientSecret"
		>,
	) {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}
		return await getTestInstance({
			// Used to trust callbackUrl in test
			account: {
				accountLinking: {
					trustedProviders: [providerId],
				},
			},
			plugins: [
				genericOAuth({
					config: [
						{
							scopes: ["openid", "profile", "email"],
							...config,
							providerId,
							redirectURI: redirectUri,
							authorizationUrl: config?.discoveryUrl
								? undefined
								: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
							tokenUrl: config?.discoveryUrl
								? undefined
								: `${authServerBaseUrl}/api/auth/oauth2/token`,
							userInfoUrl: config?.discoveryUrl
								? undefined
								: `${authServerBaseUrl}/api/auth/oauth2/userinfo`,
							clientId: oauthClient.client_id,
							clientSecret: oauthClient.client_secret,
							pkce: true,
						},
					],
				}),
			],
		});
	}

	it("should fail without the jwt plugin", async ({ expect }) => {
		await expect(
			getTestInstance({
				plugins: [
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
				],
			}),
		).rejects.toThrow("jwt_config");
	});

	// Tests if it is oauth2 compatible
	it("should sign in using generic oauth plugin", async ({ expect }) => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const { customFetchImpl: customFetchImplRP } = await createTestInstance();

		const client = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: rpBaseUrl,
			fetchOptions: {
				customFetchImpl: customFetchImplRP,
			},
		});
		const data = await client.signIn.oauth2(
			{
				providerId,
				callbackURL: "/success",
			},
			{
				throw: true,
			},
		);
		expect(data.url).toContain(
			`${authServerBaseUrl}/api/auth/oauth2/authorize`,
		);
		expect(data.url).toContain(`client_id=${oauthClient.client_id}`);

		let redirectUriResponse = "";
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				redirectUriResponse = context.response.headers.get("Location") || "";
			},
		});
		expect(redirectUriResponse).toContain(redirectUri);
		expect(redirectUriResponse).toContain("code=");

		let callbackUrl = "";
		await client.$fetch(redirectUriResponse, {
			method: "GET",
			onError(context) {
				callbackUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackUrl).toContain("/success");
	});

	it("should sign in using generic oauth discovery", async ({ expect }) => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		// The RP (Relying Party) - the client
		const { customFetchImpl: customFetchImplRP } = await createTestInstance({
			discoveryUrl: `${authServerBaseUrl}/.well-known/openid-configuration`,
		});

		const client = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: rpBaseUrl,
			fetchOptions: {
				customFetchImpl: customFetchImplRP,
			},
		});
		const data = await client.signIn.oauth2(
			{
				providerId,
				callbackURL: "/success",
			},
			{
				throw: true,
			},
		);
		expect(data.url).toContain(
			`${authServerBaseUrl}/api/auth/oauth2/authorize`,
		);
		expect(data.url).toContain(`client_id=${oauthClient.client_id}`);

		let redirectUriResponse = "";
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				redirectUriResponse = context.response.headers.get("Location") || "";
			},
		});
		expect(redirectUriResponse).toContain(redirectUri);
		expect(redirectUriResponse).toContain("code=");

		let callbackURL = "";
		await client.$fetch(redirectUriResponse, {
			method: "GET",
			onError(context) {
				callbackURL = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackURL).toContain("/success");
	});

	it("should sign in after a consent flow", async ({ expect }) => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const { customFetchImpl: customFetchImplRP, cookieSetter } =
			await createTestInstance({
				prompt: "consent",
			});

		const client = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: rpBaseUrl,
			fetchOptions: {
				customFetchImpl: customFetchImplRP,
			},
		});
		const data = await client.signIn.oauth2(
			{
				providerId,
				callbackURL: "/success",
			},
			{
				throw: true,
			},
		);
		expect(data.url).toContain(
			`${authServerBaseUrl}/api/auth/oauth2/authorize`,
		);
		expect(data.url).toContain(`client_id=${oauthClient.client_id}`);

		let consentRedirectUri = "";
		const newHeaders = new Headers();
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				consentRedirectUri = context.response.headers.get("Location") || "";
				cookieSetter(newHeaders)(context);
				newHeaders.append("Cookie", headers.get("Cookie") || "");
			},
		});
		expect(consentRedirectUri).toContain(`/consent`);
		expect(consentRedirectUri).toContain(`client_id=${oauthClient.client_id}`);
		expect(consentRedirectUri).toContain(`scope=`);

		// Give consent and obtain redirect callback
		const res = await serverClient.oauth2.consent(
			{
				accept: true,
			},
			{
				headers: newHeaders,
				throw: true,
			},
		);
		expect(res.redirect_uri).toContain(redirectUri);
		expect(res.redirect_uri).toContain(`code=`);

		let callbackURL = "";
		await client.$fetch(res.redirect_uri, {
			method: "GET",
			onError(context) {
				callbackURL = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackURL).toContain("/success");
	});

	// NOTE: Previous test must be successful since consent for user was given in the previous test
	it("should sign in after a login flow (consent given in previous test)", async ({
		expect,
	}) => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const { customFetchImpl: customFetchImplRP, cookieSetter } =
			await createTestInstance({
				prompt: "login",
			});

		const client = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: rpBaseUrl,
			fetchOptions: {
				customFetchImpl: customFetchImplRP,
			},
		});
		const data = await client.signIn.oauth2(
			{
				providerId,
				callbackURL: "/success",
			},
			{
				throw: true,
			},
		);
		expect(data.url).toContain(
			`${authServerBaseUrl}/api/auth/oauth2/authorize`,
		);
		expect(data.url).toContain(`client_id=${oauthClient.client_id}`);

		let loginRedirectUri = "";
		const newHeaders = new Headers();
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				loginRedirectUri = context.response.headers.get("Location") || "";
				cookieSetter(newHeaders)(context);
			},
			headers: newHeaders,
		});
		expect(loginRedirectUri).toContain("/login");
		expect(loginRedirectUri).toContain(`prompt=login`);
		expect(loginRedirectUri).toContain(`client_id=${oauthClient.client_id}`);
		expect(loginRedirectUri).toContain(
			`redirect_uri=${encodeURIComponent(oauthClient?.redirect_uris?.at(0)!)}`,
		);

		let redirectUriResponse = "";
		await serverClient.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				headers: newHeaders,
				onError(context) {
					redirectUriResponse = context.response.headers.get("Location") || "";
					cookieSetter(newHeaders)(context);
				},
			},
		);
		expect(redirectUriResponse).toContain(redirectUri);
		expect(redirectUriResponse).toContain("code=");

		let callbackURL = "";
		await client.$fetch(redirectUriResponse, {
			onError(context) {
				callbackURL = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackURL).toContain("/success");
	});
});

describe("oauth - config", () => {
	const port = 3002;
	const authServerBaseUrl = `http://localhost:${port}`;
	const authServerUrl = `${authServerBaseUrl}/api/auth`;
	const rpBaseUrl = "http://localhost:5000";
	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;

	let server: Listener;
	let oauthClient: OAuthClient | null;

	afterEach(async () => {
		if (server) {
			await server.close();
		}
	});

	/** Create a test client */
	async function createTestInstance(
		config?: Omit<
			GenericOAuthConfig,
			"providerId" | "clientId" | "clientSecret"
		>,
	) {
		if (!oauthClient?.client_id) {
			throw Error("beforeAll not run properly");
		}
		return await getTestInstance({
			// Used to trust callbackUrl in test
			account: {
				accountLinking: {
					trustedProviders: [providerId],
				},
			},
			plugins: [
				genericOAuth({
					config: [
						{
							scopes: ["openid", "profile", "email"],
							...config,
							providerId,
							redirectURI: redirectUri,
							authorizationUrl: config?.discoveryUrl
								? undefined
								: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
							tokenUrl: config?.discoveryUrl
								? undefined
								: `${authServerBaseUrl}/api/auth/oauth2/token`,
							userInfoUrl: config?.discoveryUrl
								? undefined
								: `${authServerBaseUrl}/api/auth/oauth2/userinfo`,
							clientId: oauthClient.client_id,
							clientSecret: oauthClient?.client_secret,
							pkce: true,
						},
					],
				}),
			],
		});
	}

	it.each([
		{
			storeClientSecret: undefined,
		},
		{
			storeClientSecret: "hashed",
		},
	] as const)(
		"storeClientSecret: $storeClientSecret",
		async ({ storeClientSecret }) => {
			const {
				auth: authorizationServer,
				signInWithTestUser,
				customFetchImpl,
			} = await getTestInstance({
				baseURL: authServerBaseUrl,
				plugins: [
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						allowDynamicClientRegistration: true,
						storeClientSecret,
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
					jwt(),
				],
			});
			const { headers } = await signInWithTestUser();
			const serverClient = createAuthClient({
				plugins: [oauthProviderClient()],
				baseURL: authServerBaseUrl,
				fetchOptions: {
					customFetchImpl,
					headers,
				},
			});

			server = await listen(toNodeHandler(authorizationServer.handler), {
				port,
			});

			const createdClient = await serverClient.oauth2.register({
				redirect_uris: [redirectUri],
			});
			expect(createdClient.data?.client_id).toBeDefined();
			expect(createdClient.data?.user_id).toBeDefined();
			expect(createdClient.data?.client_secret).toBeDefined();
			expect(createdClient.data?.redirect_uris).toEqual([redirectUri]);
			oauthClient = createdClient.data;

			// The RP (Relying Party) - the client application
			const { customFetchImpl: customFetchImplRP } = await createTestInstance();

			const client = createAuthClient({
				plugins: [genericOAuthClient()],
				baseURL: rpBaseUrl,
				fetchOptions: {
					customFetchImpl: customFetchImplRP,
				},
			});
			const data = await client.signIn.oauth2(
				{
					providerId: "test",
					callbackURL: "/success",
				},
				{
					throw: true,
				},
			);
			expect(data.url).toContain(
				`${authServerBaseUrl}/api/auth/oauth2/authorize`,
			);
			expect(data.url).toContain(`client_id=${oauthClient?.client_id}`);

			let redirectUriResponse = "";
			await serverClient.$fetch(data.url, {
				method: "GET",
				onError(context) {
					redirectUriResponse = context.response.headers.get("Location") || "";
				},
			});
			expect(redirectUriResponse).toContain(redirectUri);
			expect(redirectUriResponse).toContain("code=");

			let callbackURL = "";
			await client.$fetch(redirectUriResponse, {
				onError(context) {
					callbackURL = context.response.headers.get("Location") || "";
				},
			});
			expect(callbackURL).toContain("/success");
		},
	);

	it.each([
		{
			storeClientSecret: "encrypted",
		},
	] as const)(
		"storeClientSecret: $storeClientSecret",
		async ({ storeClientSecret }) => {
			const {
				auth: authorizationServer,
				signInWithTestUser,
				customFetchImpl,
			} = await getTestInstance({
				baseURL: authServerBaseUrl,
				plugins: [
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						allowDynamicClientRegistration: true,
						storeClientSecret,
						disableJwtPlugin: true,
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
				],
			});
			const { headers } = await signInWithTestUser();
			const serverClient = createAuthClient({
				plugins: [oauthProviderClient()],
				baseURL: authServerBaseUrl,
				fetchOptions: {
					customFetchImpl,
					headers,
				},
			});

			server = await listen(toNodeHandler(authorizationServer.handler), {
				port,
			});

			const createdClient = await serverClient.oauth2.register({
				redirect_uris: [redirectUri],
			});
			expect(createdClient.data?.client_id).toBeDefined();
			expect(createdClient.data?.user_id).toBeDefined();
			expect(createdClient.data?.client_secret).toBeDefined();
			expect(createdClient.data?.redirect_uris).toEqual([redirectUri]);
			oauthClient = createdClient.data;

			// The RP (Relying Party) - the client application
			const { customFetchImpl: customFetchImplRP } = await createTestInstance();

			const client = createAuthClient({
				plugins: [genericOAuthClient()],
				baseURL: rpBaseUrl,
				fetchOptions: {
					customFetchImpl: customFetchImplRP,
				},
			});
			const data = await client.signIn.oauth2(
				{
					providerId: "test",
					callbackURL: "/success",
				},
				{
					throw: true,
				},
			);
			expect(data.url).toContain(
				`${authServerBaseUrl}/api/auth/oauth2/authorize`,
			);
			expect(data.url).toContain(`client_id=${oauthClient?.client_id}`);

			let redirectUriResponse = "";
			await serverClient.$fetch(data.url, {
				method: "GET",
				onError(context) {
					redirectUriResponse = context.response.headers.get("Location") || "";
				},
			});
			expect(redirectUriResponse).toContain(redirectUri);
			expect(redirectUriResponse).toContain("code=");

			let callbackURL = "";
			await client.$fetch(redirectUriResponse, {
				onError(context) {
					callbackURL = context.response.headers.get("Location") || "";
				},
			});
			expect(callbackURL).toContain("/success");
		},
	);

	it.each([
		{ disableJwtPlugin: false, publicClient: false, resource: false },
		{ disableJwtPlugin: true, publicClient: false, resource: false },
		{ disableJwtPlugin: false, publicClient: true, resource: false },
		{ disableJwtPlugin: true, publicClient: true, resource: false },
		{ disableJwtPlugin: false, publicClient: false, resource: true },
		{ disableJwtPlugin: true, publicClient: false, resource: true },
		{ disableJwtPlugin: false, publicClient: true, resource: true },
		{ disableJwtPlugin: true, publicClient: true, resource: true },
	])(
		"disableJwtPlugin: $disableJwtPlugin, publicClient: $publicClient, resource: $resource",
		async ({ disableJwtPlugin, publicClient, resource }) => {
			const validAudience = disableJwtPlugin
				? `${authServerBaseUrl}/api/auth`
				: "https://api.example.com";
			const {
				auth: authorizationServer,
				signInWithTestUser,
				customFetchImpl,
			} = await getTestInstance({
				baseURL: authServerBaseUrl,
				plugins: [
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						allowDynamicClientRegistration: true,
						disableJwtPlugin: disableJwtPlugin,
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
					...(disableJwtPlugin
						? []
						: [
								jwt({
									jwt: {
										audience: resource ? validAudience : undefined,
									},
								}),
							]),
				],
			});
			const { headers, user } = await signInWithTestUser();
			const serverClient = createAuthClient({
				plugins: [oauthProviderClient()],
				baseURL: authServerBaseUrl,
				fetchOptions: {
					customFetchImpl,
					headers,
				},
			});
			server = await listen(toNodeHandler(authorizationServer.handler), {
				port,
			});

			const createdClient = await serverClient.oauth2.register({
				redirect_uris: [redirectUri],
				token_endpoint_auth_method: publicClient ? "none" : undefined,
			});
			expect(createdClient.data?.client_id).toBeDefined();
			expect(createdClient.data?.user_id).toBeDefined();
			if (publicClient) {
				expect(createdClient.data?.client_secret).toBeUndefined();
			} else {
				expect(createdClient.data?.client_secret).toBeDefined();
			}
			expect(createdClient.data?.redirect_uris).toEqual([redirectUri]);
			oauthClient = createdClient.data;

			// The RP (Relying Party) - the client application
			const { customFetchImpl: customFetchImplRP } = await createTestInstance({
				tokenUrlParams: resource
					? {
							resource: validAudience,
						}
					: undefined,
			});

			const client = createAuthClient({
				plugins: [genericOAuthClient()],
				baseURL: rpBaseUrl,
				fetchOptions: {
					customFetchImpl: customFetchImplRP,
				},
			});

			const data = await client.signIn.oauth2(
				{
					providerId: "test",
					callbackURL: "/success",
				},
				{
					throw: true,
				},
			);
			expect(data.url).toContain(`${authServerUrl}/oauth2/authorize`);
			expect(data.url).toContain(`client_id=${oauthClient?.client_id}`);

			let redirectUriResponse = "";
			await serverClient.$fetch(data.url, {
				method: "GET",
				onError(context) {
					redirectUriResponse = context.response.headers.get("Location") || "";
				},
			});
			expect(redirectUriResponse).toContain(redirectUri);
			expect(redirectUriResponse).toContain("code=");

			let authToken: string | undefined;
			let callbackURL: string | undefined;
			await client.$fetch(redirectUriResponse, {
				onError(context) {
					callbackURL = context.response.headers.get("Location") ?? undefined;
					authToken =
						context.response.headers.get("set-auth-token") ?? undefined;
				},
			});
			expect(callbackURL).toContain("/success");

			// Get and check tokens
			const tokens = await client.getAccessToken(
				{ providerId: "test", userId: user.id },
				{
					auth: {
						type: "Bearer",
						token: authToken,
					},
				},
			);

			// Check for access tokens
			expect(tokens.data?.accessToken).toBeDefined();
			if (publicClient && !(resource && !disableJwtPlugin)) {
				await expect(
					verifyAccessToken(tokens.data?.accessToken!, {
						verifyOptions: {
							audience: validAudience,
							issuer: authServerUrl,
						},
						jwksUrl: disableJwtPlugin ? undefined : `${authServerUrl}/jwks`,
					}),
				).rejects.toThrowError();
			} else {
				await verifyAccessToken(tokens.data?.accessToken!, {
					verifyOptions: {
						audience: validAudience,
						issuer: authServerUrl,
					},
					jwksUrl: disableJwtPlugin ? undefined : `${authServerUrl}/jwks`,
					remoteVerify: publicClient
						? undefined
						: {
								introspectUrl: `${authServerUrl}/oauth2/introspect`,
								clientId: createdClient.data?.client_id!,
								clientSecret: createdClient.data?.client_secret!,
							},
				});
			}

			// Check id token tokens
			if (disableJwtPlugin) {
				if (!publicClient) {
					const clientSecret = oauthClient?.client_secret;
					const checkSignature = await jwtVerify(
						tokens.data?.idToken!,
						new TextEncoder().encode(clientSecret),
						{
							algorithms: ["HS256"],
						},
					);
					expect(checkSignature).toBeDefined();
				}
			} else {
				expect(tokens.data?.idToken).toBeDefined();
				const jwks = await authorizationServer.api.getJwks();
				const jwkSet = createLocalJWKSet(jwks);
				const checkSignature = await jwtVerify(tokens.data?.idToken!, jwkSet, {
					algorithms: ["EdDSA"],
				});
				expect(checkSignature).toBeDefined();
			}
		},
	);
});
