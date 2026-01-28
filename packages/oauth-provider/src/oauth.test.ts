import { createAuthClient } from "better-auth/client";
import {
	genericOAuthClient,
	multiSessionClient,
	organizationClient,
} from "better-auth/client/plugins";
import { toNodeHandler } from "better-auth/node";
import type { GenericOAuthConfig } from "better-auth/plugins/generic-oauth";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { jwt } from "better-auth/plugins/jwt";
import { multiSession } from "better-auth/plugins/multi-session";
import type { Organization } from "better-auth/plugins/organization";
import { organization } from "better-auth/plugins/organization";
import { getTestInstance } from "better-auth/test";
import { APIError } from "better-call";
import { createLocalJWKSet, jwtVerify } from "jose";
import type { Listener } from "listhen";
import { listen } from "listhen";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProviderResourceClient } from "./client-resource";
import { oauthProvider } from "./oauth";
import type { OAuthClient } from "./types/oauth";

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
					await toNodeHandler(authorizationServer.handler)(req, res);
				}
			},
			{
				port,
			},
		);

		const { headers } = await signInWithTestUser();
		const response = await authorizationServer.api.adminCreateOAuthClient({
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
	it("should sign in using generic oauth plugin", async ({
		onTestFinished,
	}) => {
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
		await authClient.$fetch(data.url, {
			method: "GET",
			onError(ctx) {
				loginRedirectUri = ctx.response.headers.get("Location") || "";
			},
		});
		expect(loginRedirectUri).toContain("/login");
		expect(loginRedirectUri).toContain(`client_id=${oauthClient.client_id}`);
		expect(loginRedirectUri).toContain(
			`redirect_uri=${encodeURIComponent(oauthClient?.redirect_uris?.at(0)!)}`,
		);
		vi.stubGlobal("window", {
			location: {
				search: new URL(loginRedirectUri, authServerBaseUrl).search,
			},
		});
		onTestFinished(() => {
			vi.unstubAllGlobals();
		});

		let signInEmailRedirectUri = "";
		await authClient.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onResponse(ctx) {
					signInEmailRedirectUri = ctx.response.headers.get("Location") || "";
				},
			},
		);
		expect(signInEmailRedirectUri).toContain(rpBaseUrl);

		let callbackUrl = "";
		await client.$fetch(signInEmailRedirectUri!, {
			method: "GET",
			headers,
			onError(context) {
				callbackUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackUrl).toContain("/success");
	});

	it("should sign in using generic oauth discovery", async ({
		onTestFinished,
	}) => {
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
		await authClient.$fetch(data.url, {
			method: "GET",
			headers,
			onError(ctx) {
				loginRedirectUri = ctx.response.headers.get("Location") || "";
			},
		});
		expect(loginRedirectUri).toContain("/login");
		expect(loginRedirectUri).toContain(`client_id=${oauthClient.client_id}`);
		expect(loginRedirectUri).toContain(
			`redirect_uri=${encodeURIComponent(oauthClient?.redirect_uris?.at(0)!)}`,
		);
		vi.stubGlobal("window", {
			location: {
				search: new URL(loginRedirectUri, authServerBaseUrl).search,
			},
		});
		onTestFinished(() => {
			vi.unstubAllGlobals();
		});

		let signInEmailRedirectUri = "";
		await authClient.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onResponse(ctx) {
					signInEmailRedirectUri = ctx.response.headers.get("Location") || "";
				},
			},
		);
		expect(signInEmailRedirectUri).toContain(rpBaseUrl);

		let callbackURL = "";
		await client.$fetch(signInEmailRedirectUri!, {
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
	let enableSelectAccount = false;
	let enablePostLogin = false;
	let isUserRegistered = true;
	const {
		auth: authorizationServer,
		customFetchImpl,
		testUser,
		cookieSetter,
	} = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt(),
			multiSession(),
			organization(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				signup: {
					page: "/signup",
					shouldRedirect() {
						return isUserRegistered ? false : "/setup";
					},
				},
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
				scopes,
				selectAccount: {
					page: "/select-account",
					shouldRedirect: selectAccount,
				},
				postLogin: {
					page: "/select-organization",
					shouldRedirect({ session }) {
						if (!enablePostLogin) return false;
						return !session?.activeOrganizationId;
					},
					consentReferenceId({ session }) {
						if (!enablePostLogin) return undefined;
						const activeOrganizationId = (session?.activeOrganizationId ??
							undefined) as string | undefined;
						if (!activeOrganizationId)
							throw new APIError("BAD_REQUEST", {
								error: "set_organization",
								error_description: "must set organization for these scopes",
							});
						return activeOrganizationId;
					},
				},
			}),
		],
	});

	async function selectAccount(context: { headers: Headers }) {
		if (!enableSelectAccount) return false;
		const allSessions = await authorizationServer.api.listDeviceSessions({
			headers: context.headers,
		});
		return allSessions?.length >= 1;
	}

	const serverClient = createAuthClient({
		plugins: [
			oauthProviderClient(),
			organizationClient(),
			multiSessionClient(),
		],
		baseURL: authServerBaseUrl,
		fetchOptions: {
			customFetchImpl,
		},
	});

	const headers = new Headers();
	let server: Listener;
	let oauthClient: OAuthClient | null;
	let org: Organization;

	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;

	// Registers a confidential client application to work with
	beforeAll(async () => {
		vi.stubGlobal("window", {
			location: {
				search: undefined,
			},
		});

		// Opens the authorization server for testing with genericOAuth
		server = await listen(
			async (req, res) => {
				// Adds openid-config as the endpoint manually since server-endpoint
				if (req.url === "/.well-known/openid-configuration") {
					const config = await authorizationServer.api.getOpenIdConfig();
					res.setHeader("Content-Type", "application/json");
					res.end(JSON.stringify(config));
				} else {
					await toNodeHandler(authorizationServer.handler)(req, res);
				}
			},
			{
				port,
			},
		);
		const { user } = await serverClient.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		);
		expect(user.id).toBeDefined();

		const response = await authorizationServer.api.adminCreateOAuthClient({
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

		const _org = await authorizationServer.api.createOrganization({
			body: {
				name: "my-org",
				slug: "my-org",
				userId: user.id,
			},
		});
		expect(_org).toBeDefined();
		org = _org!;
	});

	afterAll(async () => {
		await server.close();
		vi.unstubAllGlobals();
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

		const { customFetchImpl: customFetchImplRP } = await createTestInstance({
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
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				loginRedirectUri = context.response.headers.get("Location") || "";
			},
		});
		expect(loginRedirectUri).toContain("/login");
		expect(loginRedirectUri).toContain(`client_id=${oauthClient.client_id}`);
		expect(loginRedirectUri).toContain(
			`redirect_uri=${encodeURIComponent(oauthClient?.redirect_uris?.at(0)!)}`,
		);
	});

	it("create - should always redirect to signup", async () => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const { customFetchImpl: customFetchImplRP } = await createTestInstance({
			prompt: "create",
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

		// Check for redirection to /signup
		let signupRedirectUri = "";
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				signupRedirectUri = context.response.headers.get("Location") || "";
			},
		});
		expect(signupRedirectUri).toContain("/signup");
		expect(signupRedirectUri).toContain(`client_id=${oauthClient.client_id}`);
		expect(signupRedirectUri).toContain(
			`redirect_uri=${encodeURIComponent(oauthClient?.redirect_uris?.at(0)!)}`,
		);
	});

	it("create - should redirect to setup page", async () => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}
		isUserRegistered = false;

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

		// Check for redirection to /setup
		let setupRedirectUri = "";
		await serverClient.$fetch(data.url, {
			method: "GET",
			headers,
			onError(context) {
				setupRedirectUri = context.response.headers.get("Location") || "";
			},
		});
		expect(setupRedirectUri).toContain("/setup");
		expect(setupRedirectUri).toContain(`client_id=${oauthClient.client_id}`);
		expect(setupRedirectUri).toContain(
			`redirect_uri=${encodeURIComponent(oauthClient?.redirect_uris?.at(0)!)}`,
		);
		isUserRegistered = true;
	});

	it("consent - should sign in", async ({ onTestFinished }) => {
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
		await serverClient.$fetch(data.url, {
			method: "GET",
			headers,
			onError(context) {
				consentRedirectUri = context.response.headers.get("Location") || "";
				cookieSetter(headers)(context);
			},
		});
		expect(consentRedirectUri).toContain(`/consent`);
		expect(consentRedirectUri).toContain(`client_id=${oauthClient.client_id}`);
		expect(consentRedirectUri).toContain(`scope=`);
		expect(consentRedirectUri).toContain(`state=`);
		vi.stubGlobal("window", {
			location: {
				search: new URL(consentRedirectUri, authServerBaseUrl).search,
			},
		});

		onTestFinished(() => {
			vi.unstubAllGlobals();
		});

		// Give consent and obtain redirect callback
		const consentRes = await serverClient.oauth2.consent(
			{
				accept: true,
			},
			{
				headers,
				throw: true,
			},
		);
		expect(consentRes.redirect).toBeTruthy();
		expect(consentRes.uri).toContain(redirectUri);
		expect(consentRes.uri).toContain(`code=`);
		vi.stubGlobal("window", {
			location: {
				search: new URL(consentRes.uri, authServerBaseUrl).search,
			},
		});
		onTestFinished(() => {
			vi.unstubAllGlobals();
		});

		let callbackURL = "";
		await client.$fetch(consentRes.uri, {
			method: "GET",
			headers: oauthHeaders,
			onError(context) {
				callbackURL = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackURL).toContain("/success");
		expect(headers.get("cookie")).toContain("better-auth.session_token=");
	});

	it("consent - should sign in given previous consent (see previous test)", async ({
		onTestFinished,
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
		const data = await client.signIn.oauth2(
			{
				providerId,
				callbackURL: "/success",
			},
			{
				headers,
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		);
		expect(data.url).toContain(
			`${authServerBaseUrl}/api/auth/oauth2/authorize`,
		);
		expect(data.url).toContain(`client_id=${oauthClient.client_id}`);

		// No redirect and user should get code
		let callbackRedirectUrl = "";
		await serverClient.$fetch(data.url, {
			method: "GET",
			headers,
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
				cookieSetter(headers)(context);
			},
		});
		expect(callbackRedirectUrl).toContain(redirectUri);
		expect(callbackRedirectUrl).toContain("code=");
		expect(callbackRedirectUrl).toContain("state=");
		vi.stubGlobal("window", {
			location: {
				search: new URL(callbackRedirectUrl, authServerBaseUrl).search,
			},
		});
		onTestFinished(() => {
			vi.unstubAllGlobals();
		});

		// Code exchange should be successful
		let callbackURL = "";
		await client.$fetch(callbackRedirectUrl, {
			method: "GET",
			headers,
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
		const data = await client.signIn.oauth2(
			{
				providerId,
				callbackURL: "/success",
			},
			{
				headers,
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		);
		expect(data.url).toContain(
			`${authServerBaseUrl}/api/auth/oauth2/authorize`,
		);
		expect(data.url).toContain(`client_id=${oauthClient.client_id}`);

		// Check for redirection to /consent
		let consentRedirectUri = "";
		await serverClient.$fetch(data.url, {
			method: "GET",
			headers,
			onError(context) {
				consentRedirectUri = context.response.headers.get("Location") || "";
			},
		});
		expect(consentRedirectUri).toContain(`/consent`);
		expect(consentRedirectUri).toContain(`client_id=${oauthClient.client_id}`);
		expect(consentRedirectUri).toContain(`scope=`);
		expect(consentRedirectUri).toContain(`state=`);
	});

	it("select_account - should sign in requesting account selection", async ({
		onTestFinished,
	}) => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}
		enableSelectAccount = true;
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
		const data = await client.signIn.oauth2(
			{
				providerId,
				callbackURL: "/success",
			},
			{
				throw: true,
				headers,
				onSuccess: cookieSetter(headers),
			},
		);
		expect(data.url).toContain(
			`${authServerBaseUrl}/api/auth/oauth2/authorize`,
		);
		expect(data.url).toContain(`client_id=${oauthClient.client_id}`);

		// Check for redirection to /select-account
		let selectAccountRedirectUri = "";
		await serverClient.$fetch(data.url, {
			method: "GET",
			headers,
			onError(ctx) {
				selectAccountRedirectUri = ctx.response.headers.get("Location") || "";
				cookieSetter(headers)(ctx);
				headers.append("Cookie", headers.get("Cookie") || "");
			},
		});
		expect(selectAccountRedirectUri).toContain(`/select-account`);
		expect(selectAccountRedirectUri).toContain(
			`client_id=${oauthClient.client_id}`,
		);
		expect(selectAccountRedirectUri).toContain(`scope=`);
		expect(selectAccountRedirectUri).toContain(`state=`);
		vi.stubGlobal("window", {
			location: {
				search: new URL(selectAccountRedirectUri, authServerBaseUrl).search,
			},
		});
		onTestFinished(() => {
			vi.unstubAllGlobals();
		});

		// Account selected, continue auth flow
		const selectedAccountRes = await serverClient.oauth2.continue(
			{
				selected: true,
			},
			{
				headers,
				throw: true,
			},
		);
		expect(selectedAccountRes.redirect).toBeTruthy();
		const selectedAccountRedirectUri = selectedAccountRes?.uri;
		expect(selectedAccountRedirectUri).toContain(redirectUri);
		expect(selectedAccountRedirectUri).toContain(`code=`);

		enableSelectAccount = false;
	});

	it("login+consent - should always redirect to login and force consent (notice consent previously given)", async ({
		onTestFinished,
	}) => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const { customFetchImpl: customFetchImplRP, cookieSetter } =
			await createTestInstance({
				prompt: "login consent",
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
				headers,
				throw: true,
			},
		);
		expect(data.url).toContain(
			`${authServerBaseUrl}/api/auth/oauth2/authorize`,
		);
		expect(data.url).toContain(`client_id=${oauthClient.client_id}`);

		// Check for redirection to /login
		let loginRedirectUri = "";
		await serverClient.$fetch(data.url, {
			method: "GET",
			headers,
			onError(context) {
				loginRedirectUri = context.response.headers.get("Location") || "";
				cookieSetter(headers)(context);
			},
		});
		expect(loginRedirectUri).toContain("/login");
		expect(loginRedirectUri).toContain(`client_id=${oauthClient.client_id}`);
		expect(loginRedirectUri).toContain(
			`redirect_uri=${encodeURIComponent(oauthClient?.redirect_uris?.at(0)!)}`,
		);
		vi.stubGlobal("window", {
			location: {
				search: new URL(loginRedirectUri, authServerBaseUrl).search,
			},
		});
		onTestFinished(() => {
			vi.unstubAllGlobals();
		});

		// Check for redirection to /consent after login
		let signInEmailRedirectUri = "";
		await serverClient.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onResponse(ctx) {
					signInEmailRedirectUri = ctx.response.headers.get("Location") || "";
				},
			},
		);
		expect(signInEmailRedirectUri).toContain("/consent");
		expect(signInEmailRedirectUri).toContain("prompt=consent");
	});

	it("select_account+consent - should always redirect to select_account and force consent (notice consent previously given)", async ({
		onTestFinished,
	}) => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}
		enableSelectAccount = true;

		const { customFetchImpl: customFetchImplRP, cookieSetter } =
			await createTestInstance({
				prompt: "select_account consent",
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
				headers,
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		);
		expect(data.url).toContain(
			`${authServerBaseUrl}/api/auth/oauth2/authorize`,
		);
		expect(data.url).toContain(`client_id=${oauthClient.client_id}`);

		// Check for redirection to /select-account
		let selectAccountRedirectUri = "";
		await serverClient.$fetch(data.url, {
			method: "GET",
			headers,
			onError(ctx) {
				selectAccountRedirectUri = ctx.response.headers.get("Location") || "";
				cookieSetter(headers)(ctx);
				headers.append("Cookie", headers.get("Cookie") || "");
			},
		});
		expect(selectAccountRedirectUri).toContain(`/select-account`);
		expect(selectAccountRedirectUri).toContain(
			`client_id=${oauthClient.client_id}`,
		);
		expect(selectAccountRedirectUri).toContain(`scope=`);
		expect(selectAccountRedirectUri).toContain(`state=`);
		vi.stubGlobal("window", {
			location: {
				search: new URL(selectAccountRedirectUri, authServerBaseUrl).search,
			},
		});
		onTestFinished(() => {
			vi.unstubAllGlobals();
		});

		// Account selected, continue auth flow
		const selectedAccountRes = await serverClient.oauth2.continue(
			{
				selected: true,
			},
			{
				headers,
				throw: true,
			},
		);
		expect(selectedAccountRes.redirect).toBeTruthy();
		const consentRedirectUri = selectedAccountRes?.uri;
		expect(consentRedirectUri).toContain(`/consent`);
		expect(consentRedirectUri).toContain(`client_id=${oauthClient.client_id}`);
		expect(consentRedirectUri).toContain(`scope=`);
		expect(consentRedirectUri).toContain(`state=`);

		enableSelectAccount = false;
	});

	it("shall allow user to select an organization/team post login and consent", async ({
		onTestFinished,
	}) => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}
		enablePostLogin = true;
		const { customFetchImpl: customFetchImplRP, cookieSetter } =
			await createTestInstance();
		const client = createAuthClient({
			plugins: [genericOAuthClient(), organization()],
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
				headers,
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
		await serverClient.$fetch(data.url, {
			method: "GET",
			headers,
			onError(context) {
				selectAccountRedirectUri =
					context.response.headers.get("Location") || "";
				cookieSetter(headers)(context);
			},
		});
		expect(selectAccountRedirectUri).toContain(`/select-organization`);
		expect(selectAccountRedirectUri).toContain(
			`client_id=${oauthClient.client_id}`,
		);
		expect(selectAccountRedirectUri).toContain(`scope=`);
		expect(selectAccountRedirectUri).toContain(`state=`);
		vi.stubGlobal("window", {
			location: {
				search: new URL(selectAccountRedirectUri, authServerBaseUrl).search,
			},
		});
		onTestFinished(() => {
			vi.unstubAllGlobals();
		});

		// Select Account and continue auth flow
		await serverClient.organization.setActive(
			{
				organizationId: org.id,
				organizationSlug: org.slug,
			},
			{
				headers,
				throw: true,
				onResponse: cookieSetter(headers),
			},
		);
		const selectedAccountRes = await serverClient.oauth2.continue(
			{
				postLogin: true,
			},
			{
				headers,
				throw: true,
				onResponse: cookieSetter(headers),
			},
		);
		expect(selectedAccountRes.redirect).toBeTruthy();
		const consentRedirectUri = selectedAccountRes?.uri;
		expect(consentRedirectUri).toContain(`/consent`);
		expect(consentRedirectUri).toContain(`client_id=${oauthClient.client_id}`);
		expect(consentRedirectUri).toContain(`scope=`);
		expect(consentRedirectUri).toContain(`state=`);
		vi.stubGlobal("window", {
			location: {
				search: new URL(consentRedirectUri, authServerBaseUrl).search,
			},
		});
		onTestFinished(() => {
			vi.unstubAllGlobals();
		});

		// Give consent and obtain redirect callback
		const consentRes = await serverClient.oauth2.consent(
			{
				accept: true,
			},
			{
				headers,
				throw: true,
				onResponse: cookieSetter(headers),
			},
		);
		expect(consentRes.uri).toContain(redirectUri);
		expect(consentRes.uri).toContain(`code=`);

		enablePostLogin = false;
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
	] as const)("storeClientSecret: $storeClientSecret", async ({
		storeClientSecret,
	}) => {
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

		const createdClient = await authorizationServer.api.adminCreateOAuthClient({
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
	});

	it.each([
		{
			storeClientSecret: "encrypted",
		},
	] as const)("storeClientSecret: $storeClientSecret", async ({
		storeClientSecret,
	}) => {
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

		const createdClient = await authorizationServer.api.adminCreateOAuthClient({
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
	});

	it.each([
		{ disableJwtPlugin: false, publicClient: false, resource: false },
		{ disableJwtPlugin: true, publicClient: false, resource: false },
		{ disableJwtPlugin: false, publicClient: true, resource: false },
		{ disableJwtPlugin: true, publicClient: true, resource: false },
		{ disableJwtPlugin: false, publicClient: false, resource: true },
		{ disableJwtPlugin: true, publicClient: false, resource: true },
		{ disableJwtPlugin: false, publicClient: true, resource: true },
		{ disableJwtPlugin: true, publicClient: true, resource: true },
	])("token return type - disableJwtPlugin: $disableJwtPlugin, publicClient: $publicClient, resource: $resource", async ({
		disableJwtPlugin,
		publicClient,
		resource,
	}) => {
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
					validAudiences: resource ? [validAudience] : undefined,
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
				}),
				...(disableJwtPlugin ? [] : [jwt()]),
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

		const createdClient = await authorizationServer.api.adminCreateOAuthClient({
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
			plugins: [oauthProviderResourceClient(), genericOAuthClient()],
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
				authToken = context.response.headers.get("set-auth-token") ?? undefined;
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
					jwksUrl: (disableJwtPlugin ? undefined : `${authServerUrl}/jwks`)!,
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
					jwksUrl: (disableJwtPlugin ? undefined : `${authServerUrl}/jwks`)!,
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
	});
});

describe("oauth - rate limiting", () => {
	it("should have default rate limits configured", async () => {
		const { auth } = await getTestInstance({
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

		const plugin = auth.options.plugins?.find((p) => p.id === "oauth-provider");
		expect(plugin?.rateLimit).toBeDefined();
		expect(plugin?.rateLimit?.length).toBe(6);

		// Check token endpoint default
		const tokenRule = plugin?.rateLimit?.find((r) =>
			r.pathMatcher("/oauth2/token"),
		);
		expect(tokenRule?.window).toBe(60);
		expect(tokenRule?.max).toBe(20);

		// Check authorize endpoint default
		const authorizeRule = plugin?.rateLimit?.find((r) =>
			r.pathMatcher("/oauth2/authorize"),
		);
		expect(authorizeRule?.window).toBe(60);
		expect(authorizeRule?.max).toBe(30);

		// Check introspect endpoint default
		const introspectRule = plugin?.rateLimit?.find((r) =>
			r.pathMatcher("/oauth2/introspect"),
		);
		expect(introspectRule?.window).toBe(60);
		expect(introspectRule?.max).toBe(100);

		// Check revoke endpoint default
		const revokeRule = plugin?.rateLimit?.find((r) =>
			r.pathMatcher("/oauth2/revoke"),
		);
		expect(revokeRule?.window).toBe(60);
		expect(revokeRule?.max).toBe(30);

		// Check register endpoint default
		const registerRule = plugin?.rateLimit?.find((r) =>
			r.pathMatcher("/oauth2/register"),
		);
		expect(registerRule?.window).toBe(60);
		expect(registerRule?.max).toBe(5);

		// Check userinfo endpoint default
		const userinfoRule = plugin?.rateLimit?.find((r) =>
			r.pathMatcher("/oauth2/userinfo"),
		);
		expect(userinfoRule?.window).toBe(60);
		expect(userinfoRule?.max).toBe(60);
	});

	it("should allow custom rate limit values", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
					rateLimit: {
						token: { window: 1, max: 4 },
						introspect: { window: 1, max: 50 },
					},
				}),
			],
		});

		const plugin = auth.options.plugins?.find((p) => p.id === "oauth-provider");

		// Check custom token values
		const tokenRule = plugin?.rateLimit?.find((r) =>
			r.pathMatcher("/oauth2/token"),
		);
		expect(tokenRule?.window).toBe(1);
		expect(tokenRule?.max).toBe(4);

		// Check custom introspect values
		const introspectRule = plugin?.rateLimit?.find((r) =>
			r.pathMatcher("/oauth2/introspect"),
		);
		expect(introspectRule?.window).toBe(1);
		expect(introspectRule?.max).toBe(50);

		// Other endpoints should still have defaults
		const authorizeRule = plugin?.rateLimit?.find((r) =>
			r.pathMatcher("/oauth2/authorize"),
		);
		expect(authorizeRule?.window).toBe(60);
		expect(authorizeRule?.max).toBe(30);
	});

	it("should allow disabling rate limit for specific endpoints", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
					rateLimit: {
						token: false,
						introspect: false,
					},
				}),
			],
		});

		const plugin = auth.options.plugins?.find((p) => p.id === "oauth-provider");

		// Token and introspect should be disabled (not in array)
		expect(plugin?.rateLimit?.length).toBe(4);

		const tokenRule = plugin?.rateLimit?.find((r) =>
			r.pathMatcher("/oauth2/token"),
		);
		expect(tokenRule).toBeUndefined();

		const introspectRule = plugin?.rateLimit?.find((r) =>
			r.pathMatcher("/oauth2/introspect"),
		);
		expect(introspectRule).toBeUndefined();

		// Other endpoints should still exist
		const authorizeRule = plugin?.rateLimit?.find((r) =>
			r.pathMatcher("/oauth2/authorize"),
		);
		expect(authorizeRule).toBeDefined();
	});

	it("should enforce rate limits on token endpoint", async () => {
		const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance(
			{
				rateLimit: {
					enabled: true,
				},
				plugins: [
					jwt(),
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
						rateLimit: {
							token: { window: 60, max: 3 },
						},
					}),
				],
			},
		);

		const { headers } = await signInWithTestUser();
		const client = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: ["http://localhost:5000/callback"],
			},
		});

		const statuses: number[] = [];

		// Make requests until rate limited
		for (let i = 0; i < 5; i++) {
			const response = await customFetchImpl(
				"http://localhost:3000/api/auth/oauth2/token",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({
						grant_type: "client_credentials",
						client_id: client!.client_id,
						client_secret: client!.client_secret!,
					}).toString(),
				},
			);
			statuses.push(response.status);
		}

		// First 3 requests should succeed (200), last 2 should be rate limited (429)
		expect(statuses[0]).toBe(200);
		expect(statuses[1]).toBe(200);
		expect(statuses[2]).toBe(200);
		expect(statuses[3]).toBe(429);
		expect(statuses[4]).toBe(429);
	});

	it("should not rate limit when endpoint rate limit is disabled", async () => {
		const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance(
			{
				rateLimit: {
					enabled: true,
				},
				plugins: [
					jwt(),
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
						rateLimit: {
							token: false, // Disable rate limiting for token endpoint
						},
					}),
				],
			},
		);

		const { headers } = await signInWithTestUser();
		const client = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: ["http://localhost:5000/callback"],
			},
		});

		// Make 10 requests - none should be rate limited
		for (let i = 0; i < 10; i++) {
			const response = await customFetchImpl(
				"http://localhost:3000/api/auth/oauth2/token",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({
						grant_type: "client_credentials",
						client_id: client!.client_id,
						client_secret: client!.client_secret!,
					}).toString(),
				},
			);
			expect(response.status).toBe(200);
		}
	});

	// Note: Window expiry/reset behavior is tested in the core rate-limiter tests.
	// See packages/better-auth/src/api/rate-limiter/rate-limiter.test.ts
});
