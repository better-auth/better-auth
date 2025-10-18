import { beforeAll, afterAll, afterEach, describe, it, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { oauthProvider } from "./oauth";
import { genericOAuth, type GenericOAuthConfig } from "../generic-oauth";
import type { OAuthClient } from "../../oauth-2.1/types";
import { createAuthClient } from "../../client";
import { oauthProviderClient } from "./client";
import { genericOAuthClient } from "../generic-oauth/client";
import { jwt } from "../jwt";
import { listen, type Listener } from "listhen";
import { toNodeHandler } from "../../integrations/node";
import { createLocalJWKSet, jwtVerify } from "jose";

describe("oauth - init", () => {
	it("should fail without the jwt plugin", async () => {
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

	it("should pass with correct plugins", async () => {
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
		cookieSetter,
		testUser,
	} = await getTestInstance({
		baseURL: authServerBaseUrl,
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
	});
	const authClient = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: {
			customFetchImpl,
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

		const { headers } = await signInWithTestUser();
		const response = await authorizationServer.api.createOAuthClient({
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

	// Tests if it is oauth2 compatible
	it("should sign in using generic oauth plugin", async () => {
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
		const headers = new Headers();
		const data = await client.signIn.oauth2(
			{
				providerId,
				callbackURL: "/success",
			},
			{
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		);
		expect(data.url).toContain(
			`${authServerBaseUrl}/api/auth/oauth2/authorize`,
		);
		expect(data.url).toContain(`client_id=${oauthClient.client_id}`);

		let loginRedirectUri = "";
		const authClientHeaders = new Headers();
		await authClient.$fetch(data.url, {
			method: "GET",
			onError(ctx) {
				loginRedirectUri = ctx.response.headers.get("Location") || "";
				cookieSetter(authClientHeaders)(ctx);
			},
		});
		expect(loginRedirectUri).toContain("/login");
		expect(loginRedirectUri).toContain(`client_id=${oauthClient.client_id}`);
		expect(loginRedirectUri).toContain(
			`redirect_uri=${encodeURIComponent(oauthClient?.redirect_uris?.at(0)!)}`,
		);

		authClientHeaders.append("accept", "application/json");
		const res = await authClient.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				headers: authClientHeaders,
			},
		);
		expect(res.data?.redirect).toBeTruthy();
		expect(res.data?.url).toContain(rpBaseUrl);

		let callbackUrl = "";
		await client.$fetch(res.data?.url!, {
			method: "GET",
			headers,
			onError(context) {
				callbackUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackUrl).toContain("/success");
	});

	it("should sign in using generic oauth discovery", async () => {
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
		const headers = new Headers();
		const data = await client.signIn.oauth2(
			{
				providerId,
				callbackURL: "/success",
			},
			{
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		);
		expect(data.url).toContain(
			`${authServerBaseUrl}/api/auth/oauth2/authorize`,
		);
		expect(data.url).toContain(`client_id=${oauthClient.client_id}`);

		let loginRedirectUri = "";
		const authClientHeaders = new Headers();
		await authClient.$fetch(data.url, {
			method: "GET",
			onError(ctx) {
				loginRedirectUri = ctx.response.headers.get("Location") || "";
				cookieSetter(authClientHeaders)(ctx);
			},
		});
		expect(loginRedirectUri).toContain("/login");
		expect(loginRedirectUri).toContain(`client_id=${oauthClient.client_id}`);
		expect(loginRedirectUri).toContain(
			`redirect_uri=${encodeURIComponent(oauthClient?.redirect_uris?.at(0)!)}`,
		);

		authClientHeaders.append("accept", "application/json");
		const res = await authClient.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				headers: authClientHeaders,
			},
		);
		expect(res.data?.redirect).toBeTruthy();
		expect(res.data?.url).toContain(rpBaseUrl);

		let callbackURL = "";
		await client.$fetch(res.data?.url!, {
			method: "GET",
			headers,
			onError(ctx) {
				callbackURL = ctx.response.headers.get("Location") || "";
			},
		});
		expect(callbackURL).toContain("/success");
	});
});

describe("oauth - prompt", async () => {
	const port = 3001;
	const authServerBaseUrl = `http://localhost:${port}`;
	const rpBaseUrl = "http://localhost:5000";
	const scopes = ["openid", "profile", "email", "offline_access", "read:posts"];
	let accountSelected = false;
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
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
				scopes,
				selectAccountPage: "/select-account",
				selectedAccount: () => {
					return accountSelected;
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

		const response = await authorizationServer.api.createOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
			},
		});
		expect(response?.client_id).toBeDefined();
		expect(response?.user_id).toBeDefined();
		expect(response?.client_secret).toBeDefined();
		expect(response?.redirect_uris).toEqual([redirectUri]);
		oauthClient = response;
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

	it("login - should always redirect to login", async () => {
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

		// Generate authorize url
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

		// Check for redirection to /login
		let loginRedirectUri = "";
		const newHeaders = new Headers();
		await serverClient.$fetch(data.url, {
			method: "GET",
			headers: newHeaders,
			onError(context) {
				loginRedirectUri = context.response.headers.get("Location") || "";
				cookieSetter(newHeaders)(context);
			},
		});
		expect(loginRedirectUri).toContain("/login");
		expect(loginRedirectUri).toContain(`client_id=${oauthClient.client_id}`);
		expect(loginRedirectUri).toContain(
			`redirect_uri=${encodeURIComponent(oauthClient?.redirect_uris?.at(0)!)}`,
		);
	});

	it("consent - should sign in", async () => {
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

		// Generate authorize url
		const oauthHeaders = new Headers();
		const data = await client.signIn.oauth2(
			{
				providerId,
				callbackURL: "/success",
			},
			{
				throw: true,
				onSuccess: cookieSetter(oauthHeaders),
			},
		);
		expect(data.url).toContain(
			`${authServerBaseUrl}/api/auth/oauth2/authorize`,
		);
		expect(data.url).toContain(`client_id=${oauthClient.client_id}`);
		expect(data.url).toContain(`prompt=consent`);

		// Check for redirection to /consent
		let consentRedirectUri = "";
		const newHeaders = new Headers();
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				consentRedirectUri = context.response.headers.get("Location") || "";
				expect(context.response.headers.get("set-cookie")).toContain(
					"better-auth.oauth_consent=",
				);
				cookieSetter(newHeaders)(context);
				newHeaders.append("Cookie", headers.get("Cookie") || "");
			},
		});
		expect(consentRedirectUri).toContain(`/consent`);
		expect(consentRedirectUri).toContain(`client_id=${oauthClient.client_id}`);
		expect(consentRedirectUri).toContain(`scope=`);
		expect(consentRedirectUri).toContain(`state=`);

		// Give consent and obtain redirect callback
		const consentRes = await serverClient.oauth2.consent(
			{
				accept: true,
			},
			{
				headers: newHeaders,
				throw: true,
				onResponse(context) {
					expect(context.response.headers.get("set-cookie")).toContain(
						"better-auth.oauth_consent=; Max-Age=0",
					);
				},
			},
		);
		expect(consentRes.redirect_uri).toContain(redirectUri);
		expect(consentRes.redirect_uri).toContain(`code=`);

		let callbackURL = "";
		await client.$fetch(consentRes.redirect_uri, {
			method: "GET",
			headers: oauthHeaders,
			onError(context) {
				callbackURL = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackURL).toContain("/success");
		expect(newHeaders.get("cookie")).toContain("better-auth.session_token=");
	});

	it("consent - should sign in given previous consent (see previous test)", async ({
		expect,
	}) => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const { customFetchImpl: customFetchImplRP, cookieSetter } =
			await createTestInstance();
		const client = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: rpBaseUrl,
			fetchOptions: {
				customFetchImpl: customFetchImplRP,
			},
		});

		// Generate authorize url
		const oauthHeaders = new Headers();
		const data = await client.signIn.oauth2(
			{
				providerId,
				callbackURL: "/success",
			},
			{
				throw: true,
				onSuccess: cookieSetter(oauthHeaders),
			},
		);
		expect(data.url).toContain(
			`${authServerBaseUrl}/api/auth/oauth2/authorize`,
		);
		expect(data.url).toContain(`client_id=${oauthClient.client_id}`);

		// No redirect and user should get code
		let callbackRedirectUrl = "";
		const newHeaders = new Headers();
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
				cookieSetter(newHeaders)(context);
				newHeaders.append("Cookie", headers.get("Cookie") || "");
			},
		});
		expect(callbackRedirectUrl).toContain(redirectUri);
		expect(callbackRedirectUrl).toContain("code=");
		expect(callbackRedirectUrl).toContain("state=");

		// Code exchange should be successful
		let callbackURL = "";
		await client.$fetch(callbackRedirectUrl, {
			method: "GET",
			headers: oauthHeaders,
			onError(context) {
				callbackURL = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackURL).toContain("/success");
	});

	it("consent - should consent again given new scope", async () => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const { customFetchImpl: customFetchImplRP, cookieSetter } =
			await createTestInstance({
				scopes: ["openid", "profile", "email", "offline_access"],
			});
		const client = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: rpBaseUrl,
			fetchOptions: {
				customFetchImpl: customFetchImplRP,
			},
		});

		// Generate authorize url
		const oauthHeaders = new Headers();
		const data = await client.signIn.oauth2(
			{
				providerId,
				callbackURL: "/success",
			},
			{
				throw: true,
				onSuccess: cookieSetter(oauthHeaders),
			},
		);
		expect(data.url).toContain(
			`${authServerBaseUrl}/api/auth/oauth2/authorize`,
		);
		expect(data.url).toContain(`client_id=${oauthClient.client_id}`);

		// Check for redirection to /consent
		let consentRedirectUri = "";
		const newHeaders = new Headers();
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				consentRedirectUri = context.response.headers.get("Location") || "";
				expect(context.response.headers.get("set-cookie")).toContain(
					"better-auth.oauth_consent=",
				);
				cookieSetter(newHeaders)(context);
				newHeaders.append("Cookie", headers.get("Cookie") || "");
			},
		});
		expect(consentRedirectUri).toContain(`/consent`);
		expect(consentRedirectUri).toContain(`client_id=${oauthClient.client_id}`);
		expect(consentRedirectUri).toContain(`scope=`);
		expect(consentRedirectUri).toContain(`state=`);
	});

	it("select_account - should sign in requesting account selection and consent", async () => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const { customFetchImpl: customFetchImplRP, cookieSetter } =
			await createTestInstance({
				scopes: ["openid", "profile", "email", "read:posts"],
			});
		const client = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: rpBaseUrl,
			fetchOptions: {
				customFetchImpl: customFetchImplRP,
			},
		});

		// Generate authorize url
		const oauthHeaders = new Headers();
		const data = await client.signIn.oauth2(
			{
				providerId,
				callbackURL: "/success",
			},
			{
				throw: true,
				onSuccess: cookieSetter(oauthHeaders),
			},
		);
		expect(data.url).toContain(
			`${authServerBaseUrl}/api/auth/oauth2/authorize`,
		);
		expect(data.url).toContain(`client_id=${oauthClient.client_id}`);

		// Check for redirection to /select-account
		let selectAccountRedirectUri = "";
		const newHeaders = new Headers();
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				selectAccountRedirectUri =
					context.response.headers.get("Location") || "";
				expect(context.response.headers.get("set-cookie")).toContain(
					"better-auth.oauth_select_account=",
				);
				cookieSetter(newHeaders)(context);
				newHeaders.append("Cookie", headers.get("Cookie") || "");
			},
		});
		expect(selectAccountRedirectUri).toContain(`/select-account`);
		expect(selectAccountRedirectUri).toContain(
			`client_id=${oauthClient.client_id}`,
		);
		expect(selectAccountRedirectUri).toContain(`scope=`);
		expect(selectAccountRedirectUri).toContain(`state=`);

		// Select account and redirect to /consent
		accountSelected = true;
		const selectedAccountRes = await serverClient.oauth2.selectedAccount(
			{
				confirm: true,
			},
			{
				headers: newHeaders,
				throw: true,
				onResponse(context) {
					expect(context.response.headers.get("set-cookie")).toContain(
						"better-auth.oauth_select_account=; Max-Age=0",
					);
					expect(context.response.headers.get("set-cookie")).toContain(
						"better-auth.oauth_consent=",
					);
					cookieSetter(newHeaders)(context);
				},
			},
		);
		expect(selectedAccountRes.redirect_uri).toContain(`/consent`);
		expect(selectedAccountRes.redirect_uri).toContain(
			`client_id=${oauthClient.client_id}`,
		);
		expect(selectedAccountRes.redirect_uri).toContain(`scope=`);
		expect(selectedAccountRes.redirect_uri).toContain(`state=`);

		// Give consent and obtain redirect callback
		const acceptedScopes = ["openid", "read:posts"];
		const consentRes = await serverClient.oauth2.consent(
			{
				accept: true,
				scope: acceptedScopes.join(" "),
			},
			{
				headers: newHeaders,
				throw: true,
				onResponse(context) {
					expect(context.response.headers.get("set-cookie")).toContain(
						"better-auth.oauth_consent=; Max-Age=0",
					);
				},
			},
		);
		expect(consentRes.redirect_uri).toContain(redirectUri);
		expect(consentRes.redirect_uri).toContain(`code=`);
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

			const createdClient = await authorizationServer.api.createOAuthClient({
				headers,
				body: {
					redirect_uris: [redirectUri],
					skip_consent: true,
				},
			});
			expect(createdClient?.client_id).toBeDefined();
			expect(createdClient?.user_id).toBeDefined();
			expect(createdClient?.client_secret).toBeDefined();
			expect(createdClient?.redirect_uris).toEqual([redirectUri]);
			oauthClient = createdClient;

			// The RP (Relying Party) - the client application
			const { customFetchImpl: customFetchImplRP, cookieSetter } =
				await createTestInstance();

			const client = createAuthClient({
				plugins: [genericOAuthClient()],
				baseURL: rpBaseUrl,
				fetchOptions: {
					customFetchImpl: customFetchImplRP,
				},
			});
			const oauthHeaders = new Headers();
			const data = await client.signIn.oauth2(
				{
					providerId: "test",
					callbackURL: "/success",
				},
				{
					throw: true,
					onSuccess: cookieSetter(oauthHeaders),
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
				method: "GET",
				headers: oauthHeaders,
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
				cookieSetter,
			} = await getTestInstance({
				baseURL: authServerBaseUrl,
				plugins: [
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
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

			const createdClient = await authorizationServer.api.createOAuthClient({
				headers,
				body: {
					redirect_uris: [redirectUri],
					skip_consent: true,
				},
			});
			expect(createdClient?.client_id).toBeDefined();
			expect(createdClient?.user_id).toBeDefined();
			expect(createdClient?.client_secret).toBeDefined();
			expect(createdClient?.redirect_uris).toEqual([redirectUri]);
			oauthClient = createdClient;

			// The RP (Relying Party) - the client application
			const { customFetchImpl: customFetchImplRP } = await createTestInstance();

			const client = createAuthClient({
				plugins: [genericOAuthClient()],
				baseURL: rpBaseUrl,
				fetchOptions: {
					customFetchImpl: customFetchImplRP,
				},
			});
			const oauthHeaders = new Headers();
			const data = await client.signIn.oauth2(
				{
					providerId: "test",
					callbackURL: "/success",
				},
				{
					throw: true,
					onSuccess: cookieSetter(oauthHeaders),
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
				method: "GET",
				headers: oauthHeaders,
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
		"token return type - disableJwtPlugin: $disableJwtPlugin, publicClient: $publicClient, resource: $resource",
		async ({ disableJwtPlugin, publicClient, resource }) => {
			const validAudience = disableJwtPlugin
				? `${authServerBaseUrl}/api/auth`
				: "https://api.example.com";
			const {
				auth: authorizationServer,
				cookieSetter,
				signInWithTestUser,
				customFetchImpl,
			} = await getTestInstance({
				baseURL: authServerBaseUrl,
				plugins: [
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
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

			const createdClient = await authorizationServer.api.createOAuthClient({
				headers,
				body: {
					redirect_uris: [redirectUri],
					token_endpoint_auth_method: publicClient ? "none" : undefined,
					skip_consent: true,
				},
			});
			expect(createdClient?.client_id).toBeDefined();
			expect(createdClient?.user_id).toBeDefined();
			if (publicClient) {
				expect(createdClient?.client_secret).toBeUndefined();
			} else {
				expect(createdClient?.client_secret).toBeDefined();
			}
			expect(createdClient?.redirect_uris).toEqual([redirectUri]);
			oauthClient = createdClient;

			// The RP (Relying Party) - the client application
			const { customFetchImpl: customFetchImplRP } = await createTestInstance({
				tokenUrlParams: resource
					? {
							resource: validAudience,
						}
					: undefined,
			});

			const client = createAuthClient({
				plugins: [oauthProviderClient(), genericOAuthClient()],
				baseURL: rpBaseUrl,
				fetchOptions: {
					customFetchImpl: customFetchImplRP,
				},
			});
			const oauthHeaders = new Headers();
			const data = await client.signIn.oauth2(
				{
					providerId: "test",
					callbackURL: "/success",
				},
				{
					throw: true,
					onSuccess: cookieSetter(oauthHeaders),
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
				method: "GET",
				headers: oauthHeaders,
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
					client.verifyAccessToken(tokens.data?.accessToken!, {
						verifyOptions: {
							audience: validAudience,
							issuer: authServerUrl,
						},
						jwksUrl: disableJwtPlugin ? undefined : `${authServerUrl}/jwks`,
					}),
				).rejects.toThrowError();
			} else {
				const payload = await client.verifyAccessToken(
					tokens.data?.accessToken!,
					{
						verifyOptions: {
							audience: validAudience,
							issuer: authServerUrl,
						},
						jwksUrl: disableJwtPlugin ? undefined : `${authServerUrl}/jwks`,
						remoteVerify: publicClient
							? undefined
							: {
									introspectUrl: `${authServerUrl}/oauth2/introspect`,
									clientId: createdClient?.client_id!,
									clientSecret: createdClient?.client_secret!,
								},
					},
				);
				expect(payload).toMatchObject({
					sub: expect.any(String),
					iss: authServerUrl,
					scope: ["openid", "profile", "email"].join(" "),
					client_id: createdClient.client_id,
					iat: expect.any(Number),
					exp: expect.any(Number),
				});
				if (resource && !(resource && disableJwtPlugin)) {
					expect(payload?.aud).toStrictEqual([
						validAudience,
						`${authServerUrl}/oauth2/userinfo`,
					]);
				} else {
					expect(payload?.aud).toBeUndefined();
				}
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
