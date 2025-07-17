import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { oidcProvider } from ".";
import { genericOAuth, type GenericOAuthConfig } from "../generic-oauth";
import type { OauthClient } from "./types";
import { createAuthClient } from "../../client";
import { oidcClient } from "./client";
import { genericOAuthClient } from "../generic-oauth/client";
import { jwt } from "../jwt";
import { listen, type Listener } from "listhen";
import { toNodeHandler } from "../../integrations/node";

describe("oidc - init", async () => {
	it("should fail without the jwt plugin", async ({ expect }) => {
		await expect(
			getTestInstance({
				plugins: [
					oidcProvider({
						loginPage: "/login",
						consentPage: "/consent",
					}),
				],
			}),
		).rejects.toThrow();
	});

	it("should fail without the jwt plugin usesOidcProviderPlugin set", async ({
		expect,
	}) => {
		await expect(
			getTestInstance({
				plugins: [
					jwt({
						usesOidcProviderPlugin: undefined,
					}),
					oidcProvider({
						loginPage: "/login",
						consentPage: "/consent",
					}),
				],
			}),
		).rejects.toThrow();
	});

	it("should pass with correct plugins", async ({ expect }) => {
		await expect(
			getTestInstance({
				plugins: [
					jwt({
						usesOidcProviderPlugin: true,
					}),
					oidcProvider({
						loginPage: "/login",
						consentPage: "/consent",
					}),
				],
			}),
		).resolves.not.toThrow();
	});
});

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
				usesOidcProviderPlugin: true,
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
		baseURL: authServerBaseUrl,
		fetchOptions: {
			customFetchImpl,
			headers,
		},
	});

	let server: Listener;
	let oauthClient: OauthClient | null;

	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;

	// Registers a confidential client application to work with
	beforeAll(async () => {
		// Opens the authorization server for testing with genericOAuth
		server = await listen(toNodeHandler(authorizationServer.handler), {
			port: 3000,
		});

		// This test is performed in register.test.ts
		const application: Partial<OauthClient> = {
			redirect_uris: [redirectUri],
		};
		const response = await serverClient.$fetch<OauthClient>(
			"/oauth2/register",
			{
				method: "POST",
				body: application,
			},
		);
		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.user_id).toBeDefined();
		expect(response.data?.client_secret).toBeDefined();
		expect(response.data?.redirect_uris).toEqual(application.redirect_uris);

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
					oidcProvider({
						loginPage: "/login",
						consentPage: "/consent",
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
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
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
		expect(data.url).toContain(`client_id=${oauthClient.client_id}`);

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
		expect(consentRedirectUri).toContain(`/oauth2/authorize`);
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
		expect(loginRedirectURI).toContain(`client_id=${oauthClient.client_id}`);
		expect(loginRedirectURI).toContain(
			`redirect_uri=${encodeURIComponent(oauthClient?.redirect_uris?.at(0)!)}`,
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
