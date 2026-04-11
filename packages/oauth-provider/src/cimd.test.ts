import { createAuthClient } from "better-auth/client";
import { toNodeHandler } from "better-auth/node";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { Listener } from "listhen";
import { listen } from "listhen";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";

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
				allowDynamicClientRegistration: true,
				clientIdMetadataDocument: {},
				scopes: ["openid", "profile", "email", "offline_access"],
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
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
			(await authorizationServer.api.getOAuthServerConfig()) as Record<
				string,
				unknown
			>;
		expect(config.client_id_metadata_document_supported).toBe(true);
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
});
