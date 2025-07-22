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
import { genericOAuth, type GenericOAuthConfig } from "../generic-oauth";
import type { OauthClient } from "./types";
import { createAuthClient } from "../../client";
import { oidcClient } from "./client";
import { genericOAuthClient } from "../generic-oauth/client";
import { listen, type Listener } from "listhen";
import { toNodeHandler } from "../../integrations/node";
import { jwt } from "../jwt";
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from "jose";

describe("oidc", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";

	const {
		auth: authorizationServer,
		signInWithTestUser,
		customFetchImpl,
		testUser,
	} = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt({
				usesOauthProvider: true,
			}),
			oidcProvider({
				loginPage: "/login",
				consentPage: "/oauth2/authorize",
				allowDynamicClientRegistration: true,
			}),
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
	let application: OauthClient | null;

	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;

	// Registers a confidential client application to work with
	beforeAll(async () => {
		// Opens the authorization server for testing with genericOAuth
		server = await listen(toNodeHandler(authorizationServer.handler), {
			port: 3000,
		});

		// This test is performed in register.test.ts
		const _application: Partial<OauthClient> = {
			redirect_uris: [redirectUri],
		};
		const response = await serverClient.$fetch<OauthClient>(
			"/oauth2/register",
			{
				method: "POST",
				body: _application,
			},
		);
		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.user_id).toBeDefined();
		expect(response.data?.client_secret).toBeDefined();
		expect(response.data?.redirect_uris).toEqual(_application.redirect_uris);

		application = response.data;
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
		if (!application?.client_id || !application?.client_secret) {
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
							clientId: application.client_id,
							clientSecret: application.client_secret,
							pkce: true,
						},
					],
				}),
			],
		});
	}

	// Tests if it is oauth2 compatible
	it("should sign in using generic oauth plugin", async ({ expect }) => {
		if (!application?.client_id || !application?.client_secret) {
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
		expect(data.url).toContain(`client_id=${application.client_id}`);

		let redirectUri = "";
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				redirectUri = context.response.headers.get("Location") || "";
			},
		});
		expect(redirectUri).toContain(redirectUri);
		expect(redirectUri).toContain("code=");

		let callbackURL = "";
		await client.$fetch(redirectUri, {
			method: "GET",
			onError(context) {
				callbackURL = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackURL).toContain("/success");
	});

	it("should sign in using generic oauth discovery", async ({ expect }) => {
		if (!application?.client_id || !application?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		// The RP (Relying Party) - the client
		const { customFetchImpl: customFetchImplRP } = await createTestInstance({
			discoveryUrl: `${authServerBaseUrl}/api/auth/.well-known/openid-configuration`,
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
		expect(data.url).toContain(`client_id=${application.client_id}`);

		let redirectUri = "";
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				redirectUri = context.response.headers.get("Location") || "";
			},
		});

		expect(redirectUri).toContain(redirectUri);
		expect(redirectUri).toContain("code=");

		let callbackURL = "";
		await client.$fetch(redirectUri, {
			method: "GET",
			onError(context) {
				callbackURL = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackURL).toContain("/success");
	});

	it("should sign in after a consent flow", async ({ expect }) => {
		if (!application?.client_id || !application?.client_secret) {
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
		expect(data.url).toContain(`client_id=${application.client_id}`);

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
		expect(consentRedirectUri).toContain(`/oauth2/authorize`);
		expect(consentRedirectUri).toContain(`client_id=${application.client_id}`);
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
		expect(res.redirectURI).toContain(redirectUri);
		expect(res.redirectURI).toContain(`code=`);

		let callbackURL = "";
		await client.$fetch(res.redirectURI, {
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
		if (!application?.client_id || !application?.client_secret) {
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
		expect(data.url).toContain(`client_id=${application.client_id}`);

		let loginRedirectURI = "";
		const newHeaders = new Headers();
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				loginRedirectURI = context.response.headers.get("Location") || "";
				cookieSetter(newHeaders)(context);
			},
			headers: newHeaders,
		});
		expect(loginRedirectURI).toContain("/login");
		expect(loginRedirectURI).toContain(`prompt=login`);
		expect(loginRedirectURI).toContain(`client_id=${application.client_id}`);
		expect(loginRedirectURI).toContain(
			`redirect_uri=${encodeURIComponent(application?.redirect_uris?.at(0)!)}`,
		);

		let redirectUri = "";
		await serverClient.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				headers: newHeaders,
				onError(context) {
					redirectUri = context.response.headers.get("Location") || "";
					cookieSetter(newHeaders)(context);
				},
			},
		);
		expect(redirectUri).toContain(redirectUri);
		expect(redirectUri).toContain("code=");

		let callbackURL = "";
		await client.$fetch(redirectUri, {
			onError(context) {
				callbackURL = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackURL).toContain("/success");
	});
});

describe("oidc storage", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;

	test.each([
		{
			storeClientSecret: undefined,
		},
		{
			storeClientSecret: "hashed" as const,
		},
		{
			storeClientSecret: "encrypted" as const,
		},
	])("Client stored $storeClientSecret", async ({ storeClientSecret }) => {
		const {
			auth: authorizationServer,
			signInWithTestUser,
			customFetchImpl,
			testUser,
		} = await getTestInstance({
			baseURL: authServerBaseUrl,
			plugins: [
				jwt({
					usesOauthProvider: true,
				}),
				oidcProvider({
					loginPage: "/login",
					consentPage: "/oauth2/authorize",
					allowDynamicClientRegistration: true,
					requirePKCE: true,
					getAdditionalUserInfoClaim(user, scopes) {
						return {
							custom: "custom value",
							userId: user.id,
						};
					},
					storeClientSecret,
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		const serverClient = createAuthClient({
			plugins: [oidcClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: {
				customFetchImpl,
				headers,
			},
		});

		const server = await listen(toNodeHandler(authorizationServer.handler), {
			port: 3000,
		});

		let application: OauthClient | null;
		const createdClient = await serverClient.oauth2.register({
			client_name: "test-client",
			redirect_uris: [redirectUri],
		});
		expect(createdClient.data).toMatchObject({
			client_id: expect.any(String),
			client_secret: expect.any(String),
			client_name: "test-client",
			redirect_uris: [redirectUri],
			client_id_issued_at: expect.any(Number),
			client_secret_expires_at: 0,
		});
		application = createdClient.data;
		if (!application?.client_id || !application?.client_secret) {
			throw Error("createdClient not created as intended");
		}

		// The RP (Relying Party) - the client application
		const { customFetchImpl: customFetchImplRP } = await getTestInstance({
			account: {
				accountLinking: {
					trustedProviders: [providerId],
				},
			},
			plugins: [
				genericOAuth({
					config: [
						{
							providerId,
							redirectURI: redirectUri,
							clientId: application.client_id,
							clientSecret: application.client_secret,
							authorizationUrl: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
							tokenUrl: `${authServerBaseUrl}/api/auth/oauth2/token`,
							scopes: ["openid", "profile", "email"],
							pkce: true,
						},
					],
				}),
			],
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
		expect(data.url).toContain(`client_id=${application.client_id}`);

		let redirectURI = "";
		await serverClient.$fetch(data.url, {
			method: "GET",
			onError(context) {
				redirectURI = context.response.headers.get("Location") || "";
			},
		});
		expect(redirectURI).toContain(
			`${rpBaseUrl}/api/auth/oauth2/callback/${providerId}?code=`,
		);

		let callbackURL = "";
		await client.$fetch(redirectURI, {
			onError(context) {
				callbackURL = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackURL).toContain("/success");

		afterEach(async () => {
			await server.close();
		});
	});
});

describe("oidc-jwt", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;

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
				baseURL: authServerBaseUrl,
				plugins: [
					oidcProvider({
						loginPage: "/login",
						consentPage: "/oauth2/authorize",
						allowDynamicClientRegistration: true,
						requirePKCE: true,
						useJWTPlugin: useJwt,
					}),
					...(useJwt
						? [
								jwt({
									usesOauthProvider: true,
								}),
							]
						: []),
				],
			});
			const { headers } = await signInWithTestUser();
			const serverClient = createAuthClient({
				plugins: [oidcClient()],
				baseURL: authServerBaseUrl,
				fetchOptions: {
					customFetchImpl,
					headers,
				},
			});

			const server = await listen(toNodeHandler(authorizationServer.handler), {
				port: 3000,
			});

			let application: OauthClient | null;
			const createdClient = await serverClient.oauth2.register({
				client_name: "test-client",
				redirect_uris: [redirectUri],
			});
			expect(createdClient.data).toMatchObject({
				client_id: expect.any(String),
				client_secret: expect.any(String),
				client_name: "test-client",
				redirect_uris: [redirectUri],
				client_id_issued_at: expect.any(Number),
				client_secret_expires_at: 0,
			});
			application = createdClient.data;
			if (!application?.client_id || !application?.client_secret) {
				throw Error("createdClient not created as intended");
			}

			// The RP (Relying Party) - the client application
			const { customFetchImpl: customFetchImplRP } = await getTestInstance({
				account: {
					accountLinking: {
						trustedProviders: [providerId],
					},
				},
				plugins: [
					genericOAuth({
						config: [
							{
								providerId,
								redirectURI: redirectUri,
								clientId: application.client_id,
								clientSecret: application.client_secret,
								authorizationUrl: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
								tokenUrl: `${authServerBaseUrl}/api/auth/oauth2/token`,
								scopes: ["openid", "profile", "email"],
								pkce: true,
							},
						],
					}),
				],
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
			expect(data.url).toContain(`client_id=${application.client_id}`);

			let redirectURI = "";
			await serverClient.$fetch(data.url, {
				method: "GET",
				onError(context) {
					redirectURI = context.response.headers.get("Location") || "";
				},
			});
			expect(redirectURI).toContain(
				`${rpBaseUrl}/api/auth/oauth2/callback/${providerId}?code=`,
			);
			let authToken = undefined;
			let callbackURL = "";
			await client.$fetch(redirectURI, {
				onError(context) {
					callbackURL = context.response.headers.get("Location") || "";
					authToken = context.response.headers.get("set-auth-token")!;
				},
			});

			expect(callbackURL).toContain("/success");
			const accessToken = await client.getAccessToken(
				{ providerId, userId: testUser.id },
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
			} else {
				const clientSecret = application.client_secret;
				const checkSignature = await jwtVerify(
					accessToken.data?.idToken!,
					new TextEncoder().encode(clientSecret),
				);
				expect(checkSignature).toBeDefined();
			}

			// expect(checkSignature.payload).toBeDefined();
			expect(decoded.alg).toBe(expected);

			afterEach(async () => {
				await server.close();
			});
		},
	);
});
