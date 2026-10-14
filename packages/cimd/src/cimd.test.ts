import type { GenericEndpointContext } from "@better-auth/core";
import type { SchemaClient, Scope } from "@better-auth/oauth-provider";
import { oauthProvider } from "@better-auth/oauth-provider";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/client";
import { toNodeHandler } from "better-auth/node";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { Listener } from "listhen";
import { listen } from "listhen";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cimd, createCimdClientDiscovery } from "./index";

const PKCE_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

describe("Client ID Metadata Document - integration", async () => {
	const port = 3002;
	const authServerBaseUrl = `http://localhost:${port}`;
	const rpBaseUrl = "http://localhost:5002";
	const providerId = "cimd-test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;

	const clientMetadataUrl =
		"https://mcp-client.example.com/client-metadata.json";
	const metadataDocument = {
		client_id: clientMetadataUrl,
		client_name: "Test MCP Client",
		redirect_uris: [redirectUri],
		token_endpoint_auth_method: "none",
		application_type: "native",
		grant_types: ["authorization_code"],
		response_types: ["code"],
	};

	const {
		auth: authorizationServer,
		signInWithTestUser,
		customFetchImpl,
	} = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				allowDynamicClientRegistration: false,
				allowUnauthenticatedClientRegistration: false,
				scopes: ["openid", "profile", "email", "offline_access"],
			}),
			cimd({
				fetchClientMetadataResource: (input, init) =>
					globalThis.fetch(input, init),
			}),
		],
	});

	let server: Listener;

	beforeAll(async () => {
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
	});

	afterAll(async () => {
		await server.close();
	});

	it("should auto-create a public client from a URL client_id on authorize", async ({
		onTestFinished,
	}) => {
		// Stub fetch to serve the metadata document for the external URL
		const originalFetch = globalThis.fetch.bind(globalThis);
		vi.stubGlobal(
			"fetch",
			vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
				const url =
					typeof input === "string"
						? input
						: input instanceof URL
							? input.href
							: input.url;
				if (url === clientMetadataUrl) {
					return Promise.resolve(
						new Response(JSON.stringify(metadataDocument), {
							status: 200,
							headers: { "content-type": "application/json" },
						}),
					);
				}
				return originalFetch(input, init);
			}),
		);
		onTestFinished(() => {
			vi.unstubAllGlobals();
		});

		const { headers } = await signInWithTestUser();
		const authedClient = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: { customFetchImpl, headers },
		});

		// Hit /authorize with the URL as client_id
		const authorizeUrl =
			`${authServerBaseUrl}/api/auth/oauth2/authorize` +
			`?client_id=${encodeURIComponent(clientMetadataUrl)}` +
			`&response_type=code` +
			`&redirect_uri=${encodeURIComponent(redirectUri)}` +
			`&scope=openid` +
			`&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM` +
			`&code_challenge_method=S256`;

		// The authorize endpoint should redirect to the consent page
		// (not error), which proves the CIMD client was created
		let loginRedirect = "";
		await authedClient.$fetch(authorizeUrl, {
			method: "GET",
			onError(ctx) {
				loginRedirect = ctx.response.headers.get("Location") || "";
			},
		});

		// Should redirect to consent (not login, since we're signed in)
		expect(loginRedirect).toContain("/consent");
		expect(loginRedirect).toContain(
			`client_id=${encodeURIComponent(clientMetadataUrl)}`,
		);
		const context = await authorizationServer.$context;
		const storedClient = await context.adapter.findOne({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientMetadataUrl }],
		});
		expect(storedClient).toMatchObject({
			applicationType: "native",
			clientDiscoveryId: "cimd",
		});
	});

	it("does not fetch or take over an existing managed HTTPS client", async ({
		onTestFinished,
	}) => {
		const managedClientId =
			"https://managed-client.example.com/client-metadata.json";
		const context = await authorizationServer.$context;
		await context.adapter.create({
			model: "oauthClient",
			data: {
				clientId: managedClientId,
				clientDiscoveryId: null,
				clientSecret: undefined,
				name: "Managed HTTPS Client",
				redirectUris: [redirectUri],
				tokenEndpointAuthMethod: "none",
				applicationType: "native",
				grantTypes: ["authorization_code"],
				responseTypes: ["code"],
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		const metadataTransport = vi.fn(async () => {
			throw new Error("managed client must not use CIMD transport");
		});
		vi.stubGlobal("fetch", metadataTransport);
		onTestFinished(() => {
			vi.unstubAllGlobals();
		});

		const { headers } = await signInWithTestUser();
		const authedClient = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: { customFetchImpl, headers },
		});
		let redirect = "";
		await authedClient.$fetch(
			`${authServerBaseUrl}/api/auth/oauth2/authorize` +
				`?client_id=${encodeURIComponent(managedClientId)}` +
				"&response_type=code" +
				`&redirect_uri=${encodeURIComponent(redirectUri)}` +
				"&scope=openid" +
				`&code_challenge=${PKCE_CHALLENGE}` +
				"&code_challenge_method=S256",
			{
				onError(ctx) {
					redirect = ctx.response.headers.get("location") ?? "";
				},
			},
		);

		expect(redirect).toContain("/consent");
		expect(metadataTransport).not.toHaveBeenCalled();
	});

	it("refreshes a discovered client with a fresh resolver after cache restart", async () => {
		const restartedClientId =
			"https://restarted-client.example.com/client-metadata.json";
		const context = await authorizationServer.$context;
		const existing = await context.adapter.create<SchemaClient<Scope[]>>({
			model: "oauthClient",
			data: {
				clientId: restartedClientId,
				clientDiscoveryId: "cimd",
				name: "Before Restart",
				redirectUris: [redirectUri],
				tokenEndpointAuthMethod: "none",
				applicationType: "native",
				grantTypes: ["authorization_code"],
				responseTypes: ["code"],
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		const metadataTransport = vi.fn(async () =>
			Response.json({
				client_id: restartedClientId,
				client_name: "After Restart",
				redirect_uris: [redirectUri],
				token_endpoint_auth_method: "none",
				application_type: "native",
				grant_types: ["authorization_code"],
				response_types: ["code"],
			}),
		);
		const restartedDiscovery = createCimdClientDiscovery({
			fetchClientMetadataResource: metadataTransport,
		});

		const refreshed = await restartedDiscovery.resolve(
			{ context } as unknown as GenericEndpointContext,
			restartedClientId,
			existing,
		);

		expect(metadataTransport).toHaveBeenCalledTimes(1);
		expect(refreshed).toMatchObject({
			name: "After Restart",
			clientDiscoveryId: "cimd",
		});
	});

	it("persists an omitted application_type as null", async ({
		onTestFinished,
	}) => {
		const originalFetch = globalThis.fetch.bind(globalThis);
		const omittedTypeUrl =
			"https://web-client.example.com/client-metadata.json";
		const omittedTypeRedirect = "http://localhost:5199/callback";
		vi.stubGlobal(
			"fetch",
			vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
				const url =
					typeof input === "string"
						? input
						: input instanceof URL
							? input.href
							: input.url;
				if (url === omittedTypeUrl) {
					return Promise.resolve(
						new Response(
							JSON.stringify({
								client_id: omittedTypeUrl,
								client_name: "Application Type Omission Client",
								redirect_uris: [omittedTypeRedirect],
								token_endpoint_auth_method: "none",
							}),
							{ status: 200, headers: { "content-type": "application/json" } },
						),
					);
				}
				return originalFetch(input, init);
			}),
		);
		onTestFinished(() => {
			vi.unstubAllGlobals();
		});

		const { headers } = await signInWithTestUser();
		const authedClient = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: { customFetchImpl, headers },
		});
		const authorizeUrl =
			`${authServerBaseUrl}/api/auth/oauth2/authorize` +
			`?client_id=${encodeURIComponent(omittedTypeUrl)}` +
			"&response_type=code" +
			`&redirect_uri=${encodeURIComponent(omittedTypeRedirect)}` +
			"&scope=openid" +
			"&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM" +
			"&code_challenge_method=S256";
		await authedClient.$fetch(authorizeUrl, { method: "GET" });

		const context = await authorizationServer.$context;
		const storedClient = await context.adapter.findOne({
			model: "oauthClient",
			where: [{ field: "clientId", value: omittedTypeUrl }],
		});
		expect(storedClient).toMatchObject({ applicationType: null });
	});

	it("should complete authorize and consent flow with a CIMD client", async ({
		onTestFinished,
	}) => {
		const originalFetch = globalThis.fetch.bind(globalThis);
		vi.stubGlobal(
			"fetch",
			vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
				const url =
					typeof input === "string"
						? input
						: input instanceof URL
							? input.href
							: input.url;
				if (url === clientMetadataUrl) {
					return Promise.resolve(
						new Response(JSON.stringify(metadataDocument), {
							status: 200,
							headers: { "content-type": "application/json" },
						}),
					);
				}
				return originalFetch(input, init);
			}),
		);
		onTestFinished(() => {
			vi.unstubAllGlobals();
		});

		const { headers: userHeaders } = await signInWithTestUser();
		const authedClient = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: { customFetchImpl, headers: userHeaders },
		});

		// Hit authorize with the URL client_id
		const authorizeUrl =
			`${authServerBaseUrl}/api/auth/oauth2/authorize` +
			`?client_id=${encodeURIComponent(clientMetadataUrl)}` +
			`&response_type=code` +
			`&redirect_uri=${encodeURIComponent(redirectUri)}` +
			`&scope=openid` +
			`&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM` +
			`&code_challenge_method=S256`;

		let consentRedirect = "";
		await authedClient.$fetch(authorizeUrl, {
			method: "GET",
			onError(ctx) {
				consentRedirect = ctx.response.headers.get("Location") || "";
			},
		});
		expect(consentRedirect).toContain("/consent");

		// Accept consent
		vi.stubGlobal("window", {
			location: {
				search: new URL(consentRedirect, authServerBaseUrl).search,
			},
		});

		const consentResponse = await authedClient.oauth2.consent(
			{ accept: true },
			{ throw: true },
		);
		expect(consentResponse.redirect).toBe(true);
		expect(consentResponse.url).toContain(redirectUri);
		expect(consentResponse.url).toContain("code=");
	});

	it("should advertise client_id_metadata_document_supported in discovery", async () => {
		const config =
			(await authorizationServer.api.getOAuthServerConfig()) as unknown as Record<
				string,
				unknown
			>;
		expect(config.client_id_metadata_document_supported).toBe(true);
		expect(config.registration_endpoint).toBeUndefined();
	});

	it("should reject metadata document where client_id does not match URL", async ({
		onTestFinished,
	}) => {
		const originalFetch = globalThis.fetch.bind(globalThis);
		const mismatchedUrl = "https://mismatch.example.com/client-metadata.json";
		vi.stubGlobal(
			"fetch",
			vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
				const url =
					typeof input === "string"
						? input
						: input instanceof URL
							? input.href
							: input.url;
				if (url === mismatchedUrl) {
					return Promise.resolve(
						new Response(
							JSON.stringify({
								client_id: "https://wrong.example.com/other.json",
								client_name: "Mismatched Client",
								redirect_uris: ["https://mismatch.example.com/callback"],
								token_endpoint_auth_method: "none",
							}),
							{
								status: 200,
								headers: { "content-type": "application/json" },
							},
						),
					);
				}
				return originalFetch(input, init);
			}),
		);
		onTestFinished(() => {
			vi.unstubAllGlobals();
		});

		const { headers } = await signInWithTestUser();
		const authedClient = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: { customFetchImpl, headers },
		});

		const authorizeUrl =
			`${authServerBaseUrl}/api/auth/oauth2/authorize` +
			`?client_id=${encodeURIComponent(mismatchedUrl)}` +
			`&response_type=code` +
			`&redirect_uri=${encodeURIComponent("https://mismatch.example.com/callback")}` +
			`&scope=openid` +
			`&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM` +
			`&code_challenge_method=S256`;

		// Should get an error, not a consent redirect
		let errorStatus = 0;
		await authedClient.$fetch(authorizeUrl, {
			method: "GET",
			onError(ctx) {
				errorStatus = ctx.response.status;
			},
		});
		expect(errorStatus).toBeGreaterThanOrEqual(400);
	});

	it("enforces application_type redirect URI constraints from the metadata document", async ({
		onTestFinished,
	}) => {
		const originalFetch = globalThis.fetch.bind(globalThis);
		const nativeClientUrl = "https://native.example.com/client-metadata.json";
		const loopbackRedirect = "http://127.0.0.1:5099/callback";
		vi.stubGlobal(
			"fetch",
			vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
				const url =
					typeof input === "string"
						? input
						: input instanceof URL
							? input.href
							: input.url;
				if (url === nativeClientUrl) {
					return Promise.resolve(
						new Response(
							JSON.stringify({
								client_id: nativeClientUrl,
								client_name: "Mislabelled Native Client",
								// A loopback interception redirect belongs to a native
								// client; declaring `web` contradicts it.
								application_type: "web",
								redirect_uris: [loopbackRedirect],
								token_endpoint_auth_method: "none",
							}),
							{ status: 200, headers: { "content-type": "application/json" } },
						),
					);
				}
				return originalFetch(input, init);
			}),
		);
		onTestFinished(() => {
			vi.unstubAllGlobals();
		});

		const { headers } = await signInWithTestUser();
		const authedClient = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: { customFetchImpl, headers },
		});

		const authorizeUrl =
			`${authServerBaseUrl}/api/auth/oauth2/authorize` +
			`?client_id=${encodeURIComponent(nativeClientUrl)}` +
			`&response_type=code` +
			`&redirect_uri=${encodeURIComponent(loopbackRedirect)}` +
			`&scope=openid` +
			`&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM` +
			`&code_challenge_method=S256`;

		let errorStatus = 0;
		await authedClient.$fetch(authorizeUrl, {
			method: "GET",
			onError(ctx) {
				errorStatus = ctx.response.status;
			},
		});
		expect(errorStatus).toBeGreaterThanOrEqual(400);
	});

	it("allows a cross-origin registered redirect but rejects a different authorization redirect", async ({
		onTestFinished,
	}) => {
		const clientId = "https://distributed-client.example/client.json";
		const registeredRedirect = "https://callback.example/callback";
		const requestedRedirect = "https://callback.example/other";
		const originalFetch = globalThis.fetch.bind(globalThis);
		vi.stubGlobal(
			"fetch",
			vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
				const url =
					typeof input === "string"
						? input
						: input instanceof URL
							? input.href
							: input.url;
				if (url === clientId) {
					return Promise.resolve(
						new Response(
							JSON.stringify({
								client_id: clientId,
								client_name: "Distributed Client",
								redirect_uris: [registeredRedirect],
								application_type: "web",
								token_endpoint_auth_method: "none",
							}),
							{
								status: 200,
								headers: { "content-type": "application/json" },
							},
						),
					);
				}
				return originalFetch(input, init);
			}),
		);
		onTestFinished(() => {
			vi.unstubAllGlobals();
		});

		const { headers } = await signInWithTestUser();
		const authedClient = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: { customFetchImpl, headers },
		});
		let status = 0;
		let location = "";
		await authedClient.$fetch(
			`${authServerBaseUrl}/api/auth/oauth2/authorize` +
				`?client_id=${encodeURIComponent(clientId)}` +
				"&response_type=code" +
				`&redirect_uri=${encodeURIComponent(requestedRedirect)}` +
				"&scope=openid" +
				"&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM" +
				"&code_challenge_method=S256",
			{
				method: "GET",
				onError(context) {
					status = context.response.status;
					location = context.response.headers.get("location") ?? "";
				},
			},
		);
		expect(status).toBe(302);
		expect(location).toContain("error=");
		expect(location).not.toContain("/consent");
		expect(location).not.toContain("code=");
		const context = await authorizationServer.$context;
		expect(
			await context.adapter.findOne({
				model: "oauthClient",
				where: [{ field: "clientId", value: clientId }],
			}),
		).toMatchObject({ redirectUris: [registeredRedirect] });
	});

	it("accepts same-origin private_key_jwt key discovery without unrelated trustedOrigins", async ({
		onTestFinished,
	}) => {
		const clientId = "https://key-client.example.com/client-metadata.json";
		const redirectUri = "https://key-client.example.com/callback";
		const originalFetch = globalThis.fetch.bind(globalThis);
		vi.stubGlobal(
			"fetch",
			vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
				const url =
					typeof input === "string"
						? input
						: input instanceof URL
							? input.href
							: input.url;
				if (url === clientId) {
					return Promise.resolve(
						new Response(
							JSON.stringify({
								client_id: clientId,
								client_name: "Key-authenticated Client",
								redirect_uris: [redirectUri],
								application_type: "web",
								token_endpoint_auth_method: "private_key_jwt",
								jwks_uri:
									"https://key-client.example.com/.well-known/jwks.json",
								grant_types: ["authorization_code"],
								response_types: ["code"],
							}),
							{
								status: 200,
								headers: { "content-type": "application/json" },
							},
						),
					);
				}
				return originalFetch(input, init);
			}),
		);
		onTestFinished(() => {
			vi.unstubAllGlobals();
		});

		const { headers } = await signInWithTestUser();
		const authedClient = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: { customFetchImpl, headers },
		});
		let redirect = "";
		await authedClient.$fetch(
			`${authServerBaseUrl}/api/auth/oauth2/authorize` +
				`?client_id=${encodeURIComponent(clientId)}` +
				"&response_type=code" +
				`&redirect_uri=${encodeURIComponent(redirectUri)}` +
				"&scope=openid" +
				"&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM" +
				"&code_challenge_method=S256",
			{
				method: "GET",
				onError(context) {
					redirect = context.response.headers.get("location") ?? "";
				},
			},
		);
		expect(redirect).toContain("/consent");
		const context = await authorizationServer.$context;
		expect(
			await context.adapter.findOne({
				model: "oauthClient",
				where: [{ field: "clientId", value: clientId }],
			}),
		).toMatchObject({
			tokenEndpointAuthMethod: "private_key_jwt",
			jwksUri: "https://key-client.example.com/.well-known/jwks.json",
		});
	});
});
