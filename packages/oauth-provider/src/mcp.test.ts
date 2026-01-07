import type { IncomingMessage, ServerResponse } from "node:http";
import { logger } from "@better-auth/core/env";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Implementation } from "@modelcontextprotocol/sdk/types.js";
import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import { toNodeHandler } from "better-auth/node";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { APIError } from "better-call";
import type { JWTPayload } from "jose";
import { decodeJwt } from "jose";
import type { Listener } from "listhen";
import { listen } from "listhen";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProviderResourceClient } from "./client-resource";
import { handleMcpErrors, mcpHandler } from "./mcp";
import { oauthProvider } from "./oauth";
import type { OAuthClient } from "./types/oauth";

describe("mcp", async () => {
	const authServerUrl = `http://localhost:3000`;
	const apiServerBaseUrl = "http://localhost:5000";

	const apiClient = createAuthClient({
		plugins: [oauthProviderClient(), oauthProviderResourceClient()],
		baseURL: apiServerBaseUrl,
	});

	it.each([
		{
			resource: apiServerBaseUrl,
			expected: `Bearer resource_metadata="${apiServerBaseUrl}/.well-known/oauth-protected-resource"`,
		},
		{
			resource: `${apiServerBaseUrl}/resource1`,
			expected: `Bearer resource_metadata="${apiServerBaseUrl}/.well-known/oauth-protected-resource/resource1"`,
		},
		{
			resource: [apiServerBaseUrl, `${apiServerBaseUrl}/resource1`],
			expected: `Bearer resource_metadata="${apiServerBaseUrl}/.well-known/oauth-protected-resource", Bearer resource_metadata="${apiServerBaseUrl}/.well-known/oauth-protected-resource/resource1"`,
		},
	])("should provide the correct metadata using resource: $resource", async ({
		resource,
		expected,
	}) => {
		try {
			await apiClient.verifyAccessToken("bad_access_token", {
				verifyOptions: {
					issuer: authServerUrl,
					audience: resource,
				},
				jwksUrl: `${authServerUrl}/api/auth/jwks`,
			});
			expect.unreachable();
		} catch (error) {
			const err = error as APIError;
			expect(err?.statusCode).toBe(401);
			expect(new Headers(err.headers)?.get("WWW-Authenticate")).toBe(expected);
		}

		const response = await mcpHandler(
			{
				verifyOptions: {
					issuer: authServerUrl,
					audience: resource,
				},
			},
			async () => {
				return new Response("unused");
			},
		)(new Request(`${authServerUrl}/mcp`));
		expect(response?.status).toBe(401);
		expect(response?.headers.get("WWW-Authenticate")).toBe(expected);
	});
});

describe("mcp - server-client flows", async () => {
	const port = 3003;
	const apiPort = 5003;
	const authServerUrl = `http://localhost:${port}`;
	const apiServerBaseUrl = `http://localhost:${apiPort}`;
	const mcpServerUrl = `${apiServerBaseUrl}/mcp`;
	const resource = mcpServerUrl;
	const providerId = "test";
	const redirectUri = `${apiServerBaseUrl}/api/auth/oauth2/callback/${providerId}`;
	let codeVerifier: string | undefined;
	let oAuthTokens: OAuthTokens | undefined;
	const state = generateRandomString(32);
	const scopes = ["openid", "offline_access", "greeting"];

	const { auth, signInWithTestUser, customFetchImpl, cookieSetter } =
		await getTestInstance({
			baseURL: authServerUrl,
			plugins: [
				jwt({
					jwt: {
						issuer: authServerUrl,
					},
				}),
				oauthProvider({
					loginPage: "/sign-in",
					consentPage: "/consent",
					validAudiences: [apiServerBaseUrl, mcpServerUrl],
					allowDynamicClientRegistration: true,
					allowUnauthenticatedClientRegistration: true,
					scopes,
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
				}),
			],
		});

	const { headers } = await signInWithTestUser();
	const authClient = createAuthClient({
		plugins: [oauthProviderClient(), oauthProviderResourceClient(auth)],
		baseURL: authServerUrl,
		fetchOptions: {
			customFetchImpl,
			headers,
		},
	});

	const serverImplementation: Implementation = {
		name: "demo-server",
		version: "1.0.0",
	};
	const mcpServer = new McpServer(serverImplementation);
	mcpServer.registerResource(
		"greeting",
		"greet://me",
		{
			title: "Greeting Resource", // Display name for UI
			description: "Dynamic greeting generator",
		},
		async (uri, extra) => {
			const authInfo = extra.authInfo;
			const jwt = authInfo?.extra?.jwt as JWTPayload;
			return {
				contents: [
					{
						uri: uri.href,
						text: `Welcome ${jwt.sub} to ${authInfo?.clientId}`,
					},
				],
			};
		},
	);

	const mcpClient = new Client({
		name: "example-client",
		version: "1.0.0",
	});

	let authServer: Listener;
	let apiServer: Listener;
	let _apiClient: OAuthClient;
	let dynamicRegisteredClient: OAuthClient;

	beforeAll(async () => {
		// Register a confidential client
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
			},
		});
		expect(response?.client_id).toBeDefined();
		expect(response?.user_id).toBeDefined();
		expect(response?.client_secret).toBeDefined();
		expect(response?.redirect_uris).toEqual([redirectUri]);
		_apiClient = response;

		// Opens an authorization server and api server for testing
		authServer = await listen(
			async (req, res) => {
				if (req.url === "/.well-known/openid-configuration") {
					const config = await auth.api.getOpenIdConfig();
					res.setHeader("Content-Type", "application/json");
					res.end(JSON.stringify(config));
				} else if (req.url === "/.well-known/oauth-authorization-server") {
					const config = await auth.api.getOAuthServerConfig();
					res.setHeader("Content-Type", "application/json");
					res.end(JSON.stringify(config));
				} else {
					await toNodeHandler(auth.handler)(req, res);
				}
			},
			{
				port,
			},
		);
		apiServer = await listen(
			async (req: IncomingMessage & { auth?: AuthInfo }, res) => {
				if (
					req.url === "/.well-known/oauth-protected-resource" ||
					req.url === "/.well-known/oauth-protected-resource/mcp"
				) {
					const config = await authClient.getProtectedResourceMetadata({
						resource: mcpServerUrl,
					});
					res.setHeader("Content-Type", "application/json");
					res.end(JSON.stringify(config));
				} else if (req.url === "/mcp") {
					await verifyAccessToken(req, res);
					const transport = new StreamableHTTPServerTransport({
						sessionIdGenerator: undefined,
						enableJsonResponse: true,
					});
					res.on("close", () => {
						transport.close();
					});
					await mcpServer.connect(transport);
					await transport.handleRequest(req, res);
				} else {
					res.statusCode = 400;
					res.setHeader("Content-Type", "application/json");
					res.end(
						JSON.stringify({
							error: `unimplemented endpoint ${req.method} ${req.url}`,
						}),
					);
				}
			},
			{
				port: apiPort,
			},
		);
	});

	afterAll(async () => {
		await mcpClient.close();
		await mcpServer.close();
		await apiServer.close();
		await authServer.close();
	});

	async function verifyAccessToken(
		req: IncomingMessage & { auth?: AuthInfo },
		res: ServerResponse,
	) {
		const authorization = req.headers?.authorization ?? undefined;
		const accessToken = authorization?.startsWith("Bearer ")
			? authorization.replace("Bearer ", "")
			: authorization;
		try {
			const jwtPayload = await authClient.verifyAccessToken(accessToken, {
				verifyOptions: {
					issuer: authServerUrl,
					audience: resource,
				},
				jwksUrl: `${authServerUrl}/api/auth/jwks`,
			});
			req.auth = {
				token: accessToken!,
				clientId: jwtPayload?.client_id as string,
				scopes: (jwtPayload?.scope as string | undefined)?.split(" ") ?? [],
				expiresAt: jwtPayload?.exp,
				resource: jwtPayload?.aud
					? new URL(jwtPayload.aud.toString())
					: undefined,
				extra: {
					jwt: jwtPayload,
				},
			} satisfies AuthInfo;
		} catch (err) {
			try {
				handleMcpErrors(err, mcpServerUrl);
			} catch (error) {
				res.setHeader("Content-Type", "application/json");
				if (error instanceof APIError) {
					res.statusCode = error.statusCode;
					for (const [key, value] of Object.entries(error.headers || {})) {
						res.setHeader(key, value as string);
					}
					res.end(JSON.stringify(error.body));
				} else {
					res.statusCode = 500;
					res.end(JSON.stringify(String(error)));
				}
				return;
			}
		}
	}

	let authorizeUrl: URL;
	async function performAuthorize() {
		let location = "";
		await authClient.$fetch(authorizeUrl.toString(), {
			method: "GET",
			headers,
			async onError(ctx) {
				location = ctx.response.headers.get("Location") || "";
				cookieSetter(headers)(ctx);
			},
		});
		Object.defineProperty(global, "window", {
			value: {
				location: {
					search: new URL(location, authServerUrl).search,
				},
			},
			writable: true,
		});
		if (location.startsWith("/consent")) {
			const consentRes = await authClient.oauth2.consent(
				{
					accept: true,
				},
				{
					headers,
					onError(ctx) {
						cookieSetter(headers)(ctx);
					},
					onResponse(ctx) {
						location = ctx.response.headers.get("Location") || "";
					},
				},
			);
			const url = new URL(consentRes.data?.uri ?? "");
			const _state = url.searchParams.get("state");
			if ((state || _state) && state !== _state) {
				throw new Error("state mismatch");
			}
			const code = url.searchParams.get("code");
			if (!code) throw new Error("missing auth code");
			const _transport = getClientTransport();
			await _transport.finishAuth(code);
		}
	}

	let provider: OAuthClientProvider;
	function getOAuthClientProvider() {
		if (provider) return provider;
		provider = {
			redirectUrl: redirectUri,
			clientMetadata: {
				client_name: "my-client",
				client_uri: "https://ai.example.com",
				logo_uri: "https://ai.example.com/logo.png",
				tos_uri: "https://ai.example.com/terms-of-service",
				policy_uri: "https://ai.example.com/privacy-policy",
				token_endpoint_auth_method: "none",
				redirect_uris: [redirectUri],
			},
			state() {
				return state;
			},
			codeVerifier() {
				if (!codeVerifier) throw Error("no code verifier saved");
				return codeVerifier;
			},
			tokens() {
				return oAuthTokens;
			},
			clientInformation() {
				return dynamicRegisteredClient;
			},
			saveCodeVerifier(_codeVerifier) {
				codeVerifier = _codeVerifier;
			},
			saveTokens(tokens) {
				oAuthTokens = tokens;
			},
			saveClientInformation(clientInformation) {
				dynamicRegisteredClient = clientInformation as OAuthClient;
			},
			redirectToAuthorization: async (url) => {
				authorizeUrl = url;
			},
		};
		return provider;
	}

	let clientTransport: StreamableHTTPClientTransport;
	function getClientTransport() {
		const oauthProvider = getOAuthClientProvider();
		clientTransport = new StreamableHTTPClientTransport(
			new URL(`${apiServerBaseUrl}/mcp`),
			{
				authProvider: oauthProvider,
			},
		);
		clientTransport.onerror = (error) =>
			logger.error("client transport:", error);
		return clientTransport;
	}

	it("should fail first connection and obtain tokens from api server", async () => {
		try {
			const transport = getClientTransport();
			await mcpClient.connect(transport);
		} catch (error) {
			expect(error).toBeInstanceOf(UnauthorizedError);
			await mcpClient.close();
		}
	});

	it("should set oauth tokens", async () => {
		await performAuthorize();
		expect(oAuthTokens).toMatchObject({
			access_token: expect.any(String),
			expires_in: 3600,
			id_token: expect.any(String),
			scope: scopes.join(" "),
			token_type: "Bearer",
		});
	});

	it("should connect with valid credentials second time", async () => {
		try {
			const transport = getClientTransport();
			await mcpClient.connect(transport);
		} catch (_error) {
			expect.unreachable();
		}
	});

	it("should obtain resource when authenticated", async () => {
		try {
			const res = await mcpClient.readResource({
				uri: "greet://me",
			});
			const sub = oAuthTokens?.id_token
				? decodeJwt(oAuthTokens?.id_token).sub
				: undefined;
			const content = res.contents[0];
			expect(content).toMatchObject({
				uri: "greet://me",
				text: `Welcome ${sub} to ${dynamicRegisteredClient.client_id}`,
			});
		} catch (_error) {
			expect.unreachable();
		}
	});
});
