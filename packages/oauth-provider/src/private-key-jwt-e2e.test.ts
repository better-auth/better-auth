import { createAuthClient } from "better-auth/client";
import { genericOAuthClient } from "better-auth/client/plugins";
import { toNodeHandler } from "better-auth/node";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { exportJWK, generateKeyPair } from "jose";
import type { Listener } from "listhen";
import { listen } from "listhen";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthClient } from "./types/oauth";

/**
 * End-to-end test: full OAuth2 sign-in flow using private_key_jwt
 * across the entire stack.
 *
 * - Authorization server: oauthProvider plugin with a private_key_jwt client
 * - Relying party: genericOAuth plugin with authentication: "private_key_jwt"
 * - Flow: RP → authorize → login → callback → token exchange (with JWT assertion) → session
 */
describe("private_key_jwt e2e", async () => {
	const port = 3002;
	const authServerBaseUrl = `http://localhost:${port}`;
	const rpBaseUrl = "http://localhost:5002";
	const providerId = "jwt-assertion-provider";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;

	// Generate RSA key pair
	const keyPair = await generateKeyPair("RS256", { extractable: true });
	const privateJwk = await exportJWK(keyPair.privateKey);
	const publicJwk = await exportJWK(keyPair.publicKey);

	const {
		auth: authorizationServer,
		signInWithTestUser,
		customFetchImpl,
		cookieSetter,
		testUser,
	} = await getTestInstance({
		baseURL: authServerBaseUrl,
		trustedOrigins: ["https://trusted.example.com"],
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				assertionMaxLifetime: 300,
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
		fetchOptions: { customFetchImpl },
	});

	let server: Listener;
	let oauthClient: OAuthClient;
	let oauthJwksUriClient: OAuthClient;

	beforeAll(async () => {
		// Start actual HTTP server for the authorization server
		server = await listen(
			async (req, res) => {
				if (req.url === "/.well-known/openid-configuration") {
					const config = await authorizationServer.api.getOpenIdConfig();
					res.setHeader("Content-Type", "application/json");
					res.end(JSON.stringify(config));
				} else {
					await toNodeHandler(authorizationServer.handler)(req, res);
				}
			},
			{ port },
		);

		// Register a private_key_jwt client on the authorization server
		const { headers } = await signInWithTestUser();
		oauthClient = (await authorizationServer.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
				token_endpoint_auth_method: "private_key_jwt",
				jwks: [
					{
						...publicJwk,
						kid: "e2e-key-1",
						alg: "RS256",
						use: "sig",
					},
				],
			},
		}))!;
		expect(oauthClient.client_id).toBeDefined();
		expect(oauthClient.client_secret).toBeUndefined();

		oauthJwksUriClient = (await authorizationServer.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
				token_endpoint_auth_method: "private_key_jwt",
				jwks_uri: "https://trusted.example.com/.well-known/jwks.json",
			},
		}))!;
		expect(oauthJwksUriClient.client_id).toBeDefined();
		expect(oauthJwksUriClient.client_secret).toBeUndefined();
	});

	afterAll(async () => {
		await server.close();
	});

	it("should complete full sign-in flow using private_key_jwt across RP and provider", async ({
		onTestFinished,
	}) => {
		// Set up the Relying Party with genericOAuth using private_key_jwt
		const { customFetchImpl: rpFetchImpl } = await getTestInstance({
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
							clientId: oauthClient.client_id,
							clientSecret: "unused", // required by type but not used for private_key_jwt
							redirectURI: redirectUri,
							discoveryUrl: `${authServerBaseUrl}/.well-known/openid-configuration`,
							scopes: ["openid", "profile", "email"],
							pkce: true,
							authentication: "private_key_jwt",
							clientAssertion: {
								privateKeyJwk: privateJwk,
								kid: "e2e-key-1",
								algorithm: "RS256",
							},
						},
					],
				}),
			],
		});

		const rpClient = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: rpBaseUrl,
			fetchOptions: { customFetchImpl: rpFetchImpl },
		});

		// Step 1: RP initiates OAuth flow
		const rpHeaders = new Headers();
		const signInResult = await rpClient.signIn.oauth2(
			{
				providerId,
				callbackURL: "/success",
			},
			{
				throw: true,
				onSuccess: cookieSetter(rpHeaders),
			},
		);
		expect(signInResult.url).toContain(
			`${authServerBaseUrl}/api/auth/oauth2/authorize`,
		);
		expect(signInResult.url).toContain(`client_id=${oauthClient.client_id}`);

		// Step 2: Follow the authorize redirect → login page
		let loginRedirectUri = "";
		await authClient.$fetch(signInResult.url, {
			method: "GET",
			onError(ctx) {
				loginRedirectUri = ctx.response.headers.get("Location") || "";
			},
		});
		expect(loginRedirectUri).toContain("/login");

		// Step 3: Stub window for the login flow
		vi.stubGlobal("window", {
			location: {
				search: new URL(loginRedirectUri, authServerBaseUrl).search,
			},
		});
		onTestFinished(() => {
			vi.unstubAllGlobals();
		});

		// Step 4: Sign in at the authorization server
		const signInResponse = await authClient.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{ throw: true },
		);
		expect(signInResponse.redirect).toBe(true);
		expect(signInResponse.url).toContain(rpBaseUrl);

		// Step 5: Follow callback to RP — this triggers the token exchange
		// with private_key_jwt assertion. The RP sends client_assertion to
		// the authorization server's token endpoint, which verifies the JWT
		// signature against the registered JWKS.
		let callbackUrl = "";
		await rpClient.$fetch(signInResponse.url, {
			method: "GET",
			headers: rpHeaders,
			onError(context) {
				callbackUrl = context.response.headers.get("Location") || "";
			},
		});

		// If we reach the success callback, the full flow worked:
		// RP signed JWT assertion → provider verified against JWKS → tokens issued → session created
		expect(callbackUrl).toContain("/success");
	});

	it("should complete full sign-in flow using a trusted jwks_uri client", async ({
		onTestFinished,
	}) => {
		const originalFetch = globalThis.fetch.bind(globalThis);
		const fetchSpy = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.href
						: input.url;

			if (url === "https://trusted.example.com/.well-known/jwks.json") {
				return Promise.resolve(
					new Response(
						JSON.stringify({
							keys: [
								{
									...publicJwk,
									kid: "e2e-key-1",
									alg: "RS256",
									use: "sig",
								},
							],
						}),
						{
							status: 200,
							headers: { "content-type": "application/json" },
						},
					),
				);
			}

			return originalFetch(input, init);
		});
		vi.stubGlobal("fetch", fetchSpy);
		onTestFinished(() => {
			vi.unstubAllGlobals();
		});

		const { customFetchImpl: rpFetchImpl } = await getTestInstance({
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
							clientId: oauthJwksUriClient.client_id,
							clientSecret: "unused",
							redirectURI: redirectUri,
							discoveryUrl: `${authServerBaseUrl}/.well-known/openid-configuration`,
							scopes: ["openid", "profile", "email"],
							pkce: true,
							authentication: "private_key_jwt",
							clientAssertion: {
								privateKeyJwk: privateJwk,
								kid: "e2e-key-1",
								algorithm: "RS256",
							},
						},
					],
				}),
			],
		});

		const rpClient = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: rpBaseUrl,
			fetchOptions: { customFetchImpl: rpFetchImpl },
		});

		const rpHeaders = new Headers();
		const signInResult = await rpClient.signIn.oauth2(
			{
				providerId,
				callbackURL: "/success",
			},
			{
				throw: true,
				onSuccess: cookieSetter(rpHeaders),
			},
		);

		let loginRedirectUri = "";
		await authClient.$fetch(signInResult.url, {
			method: "GET",
			onError(ctx) {
				loginRedirectUri = ctx.response.headers.get("Location") || "";
			},
		});
		expect(loginRedirectUri).toContain("/login");

		vi.stubGlobal("window", {
			location: {
				search: new URL(loginRedirectUri, authServerBaseUrl).search,
			},
		});

		const signInResponse = await authClient.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{ throw: true },
		);
		expect(signInResponse.redirect).toBe(true);
		expect(signInResponse.url).toContain(rpBaseUrl);

		let callbackUrl = "";
		await rpClient.$fetch(signInResponse.url, {
			method: "GET",
			headers: rpHeaders,
			onError(context) {
				callbackUrl = context.response.headers.get("Location") || "";
			},
		});

		expect(fetchSpy).toHaveBeenCalledWith(
			"https://trusted.example.com/.well-known/jwks.json",
			expect.objectContaining({
				headers: { accept: "application/json" },
				redirect: "error",
			}),
		);
		expect(callbackUrl).toContain("/success");
	});
});
