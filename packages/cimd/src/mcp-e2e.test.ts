import { createMcpProtectedRequestHandler, mcp } from "@better-auth/mcp";
import type { OAuthClientResource } from "@better-auth/oauth-provider";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import type {
	OAuthClientInformationContext,
	OAuthClientProvider,
	OAuthDiscoveryState,
	StoredOAuthClientInformation,
	StoredOAuthTokens,
} from "@modelcontextprotocol/client";
import {
	Client,
	refreshAuthorization,
	StreamableHTTPClientTransport,
	UnauthorizedError,
} from "@modelcontextprotocol/client";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { createAuthClient } from "better-auth/client";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cimd } from "./index";

const AUTHORIZATION_SERVER = "https://auth.cimd.example.test";
const CLIENT_ID = "https://client.example.test/oauth/client.json";
const REDIRECT_URI = "https://callback.example.test/oauth/callback";
const MCP_RESOURCE = "https://resource.cimd.example.test/mcp";
const PROTOCOL_VERSION = "2026-07-28";

type FetchImplementation = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

function requestUrl(input: RequestInfo | URL): URL {
	if (input instanceof Request) return new URL(input.url);
	return new URL(input.toString());
}

interface VerifiedMcpAccessTokenClaims {
	client_id?: unknown;
	scope?: unknown;
	exp?: number;
	[claim: string]: unknown;
}

function requireAccessTokenClientId(
	accessTokenClaims: VerifiedMcpAccessTokenClaims,
): string {
	const clientId = accessTokenClaims.client_id;
	if (typeof clientId !== "string" || clientId.trim().length === 0) {
		throw new TypeError(
			"MCP access token client_id must be a non-empty string",
		);
	}
	return clientId;
}

function extractPresentedAccessToken(request: Request): string {
	const authorization = request.headers.get("authorization");
	const token = /^(?:Bearer|DPoP)[ \t]+(\S+)$/i.exec(authorization ?? "")?.[1];
	if (!token) {
		throw new TypeError(
			"verified MCP request is missing a valid Bearer or DPoP access token",
		);
	}
	return token;
}

function parseGrantedScopes(scopeClaim: unknown): string[] {
	if (typeof scopeClaim !== "string") return [];
	return [...new Set(scopeClaim.split(" ").filter(Boolean))];
}

function createOfficialSdkAuthInfo(
	request: Request,
	accessTokenClaims: VerifiedMcpAccessTokenClaims,
	resource: URL,
): AuthInfo {
	return {
		token: extractPresentedAccessToken(request),
		clientId: requireAccessTokenClientId(accessTokenClaims),
		scopes: parseGrantedScopes(accessTokenClaims.scope),
		expiresAt: accessTokenClaims.exp,
		resource,
		extra: { accessTokenClaims },
	};
}

function createCimdClientProvider() {
	let authorizationUrl: URL | undefined;
	let verifier: string | undefined;
	let discoveryState: OAuthDiscoveryState | undefined;
	let currentClient: StoredOAuthClientInformation | undefined;
	let currentTokens: StoredOAuthTokens | undefined;
	const clients = new Map<string, StoredOAuthClientInformation>();
	const tokens = new Map<string, StoredOAuthTokens>();

	const provider: OAuthClientProvider = {
		redirectUrl: REDIRECT_URI,
		clientMetadataUrl: CLIENT_ID,
		clientMetadata: {
			client_name: "CIMD SDK v2 client",
			redirect_uris: [REDIRECT_URI],
			application_type: "native",
			token_endpoint_auth_method: "none",
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
		},
		state: () => "cimd-sdk-v2-state",
		clientInformation(context?: OAuthClientInformationContext) {
			return context ? clients.get(context.issuer) : currentClient;
		},
		saveClientInformation(client, context) {
			if (!context) throw new Error("client issuer was not supplied");
			expect(client.issuer).toBe(context.issuer);
			clients.set(context.issuer, client);
			currentClient = client;
		},
		tokens(context?: OAuthClientInformationContext) {
			return context ? tokens.get(context.issuer) : currentTokens;
		},
		saveTokens(value, context) {
			if (!context) throw new Error("token issuer was not supplied");
			expect(value.issuer).toBe(context.issuer);
			tokens.set(context.issuer, value);
			currentTokens = value;
		},
		redirectToAuthorization(url) {
			authorizationUrl = url;
		},
		saveCodeVerifier(value) {
			verifier = value;
		},
		codeVerifier() {
			if (!verifier) throw new Error("PKCE verifier was not persisted");
			return verifier;
		},
		saveDiscoveryState(value) {
			discoveryState = value;
		},
		discoveryState() {
			return discoveryState;
		},
	};

	return {
		provider,
		get authorizationUrl() {
			return authorizationUrl;
		},
		get client() {
			return currentClient;
		},
		get discovery() {
			return discoveryState;
		},
		get tokens() {
			return currentTokens;
		},
	};
}

describe("official SDK AuthInfo mapping", () => {
	it.each([
		{},
		{ client_id: "" },
		{ client_id: "   " },
		{ client_id: 42 },
	])("rejects a missing or malformed client_id claim: %j", (claims) => {
		expect(() => requireAccessTokenClientId(claims)).toThrow(
			new TypeError("MCP access token client_id must be a non-empty string"),
		);
	});

	it.each([
		undefined,
		"Basic access-token",
		"Bearer",
		"Bearer ",
		"Bearer access-token trailing",
		"DPoP ",
	])("rejects a malformed authorization presentation: %j", (authorization) => {
		const headers = authorization ? { authorization } : undefined;
		expect(() =>
			extractPresentedAccessToken(
				new Request(MCP_RESOURCE, {
					headers,
				}),
			),
		).toThrow(
			new TypeError(
				"verified MCP request is missing a valid Bearer or DPoP access token",
			),
		);
	});

	it.each([
		"Bearer",
		"DPoP",
	])("extracts the actual %s access token", (scheme) => {
		expect(
			extractPresentedAccessToken(
				new Request(MCP_RESOURCE, {
					headers: { authorization: `${scheme} presented-token` },
				}),
			),
		).toBe("presented-token");
	});

	it("deduplicates string scopes and treats other claim types as empty", () => {
		expect(parseGrantedScopes("mcp:base greeting mcp:base")).toEqual([
			"mcp:base",
			"greeting",
		]);
		expect(parseGrantedScopes(undefined)).toEqual([]);
		expect(parseGrantedScopes(["mcp:base"])).toEqual([]);
	});

	it("maps verified claims and the presented token into SDK AuthInfo", () => {
		const resource = new URL(MCP_RESOURCE);
		const authInfo = createOfficialSdkAuthInfo(
			new Request(MCP_RESOURCE, {
				headers: { authorization: "DPoP actual-token" },
			}),
			{
				client_id: "mcp-client",
				scope: "mcp:base mcp:base",
				exp: 1_800_000_000,
			},
			resource,
		);

		expect(authInfo).toMatchObject({
			token: "actual-token",
			clientId: "mcp-client",
			scopes: ["mcp:base"],
			expiresAt: 1_800_000_000,
			resource,
		});
	});
});

describe("CIMD-first MCP authorization with the official SDK v2", async () => {
	let metadataFetchCount = 0;
	const metadataFetch = async (
		_input: RequestInfo | URL,
		init?: RequestInit,
	) => {
		metadataFetchCount += 1;
		if (metadataFetchCount > 1) {
			expect(new Headers(init?.headers).get("if-none-match")).toBe(
				'"client-metadata-v1"',
			);
			return new Response(null, {
				status: 304,
				headers: { "cache-control": "no-cache" },
			});
		}
		return Response.json(
			{
				client_id: CLIENT_ID,
				client_name: "CIMD SDK v2 client",
				redirect_uris: [REDIRECT_URI],
				application_type: "native",
				token_endpoint_auth_method: "none",
				grant_types: ["authorization_code", "refresh_token"],
				response_types: ["code"],
			},
			{
				headers: {
					"cache-control": "no-cache",
					etag: '"client-metadata-v1"',
				},
			},
		);
	};
	const instance = await getTestInstance({
		baseURL: AUTHORIZATION_SERVER,
		advanced: { useSecureCookies: false },
		plugins: [
			jwt({ jwt: { issuer: AUTHORIZATION_SERVER } }),
			mcp({
				loginPage: "/login",
				consentPage: "/consent",
				resource: MCP_RESOURCE,
				enforcePerClientResources: true,
				scopes: ["openid", "offline_access", "mcp:base", "greeting"],
			}),
			cimd({
				fetchClientMetadataResource: metadataFetch,
				metadataFetchPolicy: { minimumFetchInterval: 0 },
				metadataProfile: "mcp-2026-07-28",
			}),
		],
	});
	const { headers } = await instance.signInWithTestUser();
	const userClient = createAuthClient({
		baseURL: AUTHORIZATION_SERVER,
		plugins: [oauthProviderClient()],
		fetchOptions: {
			customFetchImpl: instance.customFetchImpl,
			headers,
		},
	});
	const sdkHandler = createMcpHandler(
		() => {
			const server = new McpServer({
				name: "better-auth-cimd-acceptance",
				version: "1.0.0",
			});
			server.registerTool("greet", {}, async () => ({
				content: [{ type: "text", text: "hello from CIMD" }],
			}));
			return server;
		},
		{ legacy: "reject", responseMode: "json" },
	);
	const storage = createCimdClientProvider();
	let dcrRequestCount = 0;
	const tokenRequests: URLSearchParams[] = [];

	const routeFetch: FetchImplementation = async (input, init) => {
		const url = requestUrl(input);
		const request = new Request(input, init);
		if (url.pathname === "/api/auth/oauth2/register") dcrRequestCount += 1;
		if (
			url.origin === AUTHORIZATION_SERVER &&
			url.pathname === "/api/auth/oauth2/token"
		) {
			tokenRequests.push(new URLSearchParams(await request.clone().text()));
		}
		if (url.origin === AUTHORIZATION_SERVER) {
			return instance.customFetchImpl(request.url, {
				method: request.method,
				headers: request.headers,
				body:
					request.method === "GET" || request.method === "HEAD"
						? undefined
						: await request.clone().text(),
			});
		}
		if (url.origin !== new URL(MCP_RESOURCE).origin) {
			throw new Error(`unexpected request origin: ${url.origin}`);
		}
		if (url.pathname.startsWith("/.well-known/oauth-protected-resource")) {
			return instance.customFetchImpl(request.url, {
				method: request.method,
				headers: request.headers,
			});
		}
		if (url.pathname !== "/mcp") return new Response(null, { status: 404 });

		const requiredScopes =
			request.headers.get("mcp-method") === "tools/call"
				? ["greeting"]
				: ["mcp:base"];
		return createMcpProtectedRequestHandler(
			{
				issuer: AUTHORIZATION_SERVER,
				audience: MCP_RESOURCE,
				jwksUrl: `${AUTHORIZATION_SERVER}/api/auth/jwks`,
				requiredScopes,
			},
			async (verifiedRequest, accessTokenClaims) => {
				const authInfo = createOfficialSdkAuthInfo(
					verifiedRequest,
					accessTokenClaims,
					new URL(MCP_RESOURCE),
				);
				return sdkHandler.fetch(verifiedRequest, { authInfo });
			},
		)(request);
	};

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	async function completeAuthorization(url: URL): Promise<URL> {
		let location = "";
		await userClient.$fetch(url.toString(), {
			method: "GET",
			headers,
			onError(context) {
				location = context.response.headers.get("location") ?? "";
				instance.cookieSetter(headers)(context);
			},
		});
		if (!location.includes("/consent")) {
			throw new Error(`authorization did not reach consent: ${location}`);
		}
		const consentUrl = new URL(location, AUTHORIZATION_SERVER);
		expect(consentUrl.searchParams.get("client_id")).toBe(CLIENT_ID);
		expect(consentUrl.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
		vi.stubGlobal("window", { location: { search: consentUrl.search } });
		const consent = await userClient.oauth2.consent(
			{ accept: true },
			{ headers, throw: true },
		);
		return new URL(consent.url);
	}

	function createConnection(clientStorage = storage) {
		const client = new Client(
			{ name: "cimd-acceptance-client", version: "1.0.0" },
			{ versionNegotiation: { mode: { pin: PROTOCOL_VERSION } } },
		);
		const transport = new StreamableHTTPClientTransport(new URL(MCP_RESOURCE), {
			authProvider: clientStorage.provider,
			fetch: routeFetch,
		});
		return { client, transport };
	}

	it("discovers, caches, binds, steps up, invokes, and refreshes without DCR", async () => {
		vi.stubGlobal("fetch", routeFetch);
		const discovery = await instance.auth.api.getOAuthServerConfig();
		expect(discovery.registration_endpoint).toBeUndefined();
		expect(discovery.client_id_metadata_document_supported).toBe(true);
		const protectedMetadataResponse = await routeFetch(
			`${new URL(MCP_RESOURCE).origin}/.well-known/oauth-protected-resource/mcp`,
		);
		const protectedMetadata = (await protectedMetadataResponse.json()) as {
			scopes_supported?: string[];
		};
		expect(protectedMetadata.scopes_supported).toEqual([
			"mcp:base",
			"greeting",
		]);
		expect(protectedMetadata.scopes_supported).not.toContain("offline_access");

		let connection = createConnection();
		await expect(
			connection.client.connect(connection.transport),
		).rejects.toBeInstanceOf(UnauthorizedError);
		expect(dcrRequestCount).toBe(0);
		expect(storage.authorizationUrl?.searchParams.get("resource")).toBe(
			MCP_RESOURCE,
		);
		expect(storage.client).toEqual({
			client_id: CLIENT_ID,
			issuer: AUTHORIZATION_SERVER,
		});
		expect(storage.discovery).toMatchObject({
			authorizationServerUrl: AUTHORIZATION_SERVER,
			resourceMetadata: {
				resource: MCP_RESOURCE,
				authorization_servers: [AUTHORIZATION_SERVER],
			},
			authorizationServerMetadata: {
				issuer: AUTHORIZATION_SERVER,
				client_id_metadata_document_supported: true,
				authorization_response_iss_parameter_supported: true,
			},
		});

		const callback = await completeAuthorization(storage.authorizationUrl!);
		expect(callback.searchParams.get("iss")).toBe(AUTHORIZATION_SERVER);
		await connection.transport.finishAuth(callback.searchParams);
		expect(tokenRequests.at(-1)?.get("resource")).toBe(MCP_RESOURCE);
		expect(storage.tokens).toMatchObject({
			refresh_token: expect.any(String),
			scope: "mcp:base offline_access",
			issuer: AUTHORIZATION_SERVER,
		});
		await connection.client.close();

		connection = createConnection();
		await connection.client.connect(connection.transport);
		expect(connection.transport.protocolVersion).toBe(PROTOCOL_VERSION);
		await expect(
			connection.client.callTool({ name: "greet", arguments: {} }),
		).rejects.toBeInstanceOf(UnauthorizedError);
		expect(storage.authorizationUrl?.searchParams.get("scope")).toBe(
			"mcp:base offline_access greeting",
		);
		expect(storage.authorizationUrl?.searchParams.get("resource")).toBe(
			MCP_RESOURCE,
		);
		const stepUpCallback = await completeAuthorization(
			storage.authorizationUrl!,
		);
		await connection.transport.finishAuth(stepUpCallback.searchParams);
		expect(tokenRequests.at(-1)?.get("resource")).toBe(MCP_RESOURCE);
		const result = await connection.client.callTool({
			name: "greet",
			arguments: {},
		});
		expect(result.content).toEqual([{ type: "text", text: "hello from CIMD" }]);

		const context = await instance.auth.$context;
		const resourceLinks = await context.adapter.findMany<OAuthClientResource>({
			model: "oauthClientResource",
			where: [{ field: "clientId", value: CLIENT_ID }],
		});
		expect(resourceLinks.map((link) => link.resourceId)).toEqual([
			MCP_RESOURCE,
		]);

		const reauthorizationStorage = createCimdClientProvider();
		const reauthorizationConnection = createConnection(reauthorizationStorage);
		const metadataFetchesBeforeReauthorization = metadataFetchCount;
		await expect(
			reauthorizationConnection.client.connect(
				reauthorizationConnection.transport,
			),
		).rejects.toBeInstanceOf(UnauthorizedError);
		const reauthorizationCallback = await completeAuthorization(
			reauthorizationStorage.authorizationUrl!,
		);
		expect(metadataFetchCount).toBe(metadataFetchesBeforeReauthorization + 2);
		await reauthorizationConnection.transport.finishAuth(
			reauthorizationCallback.searchParams,
		);
		expect(reauthorizationStorage.tokens).toMatchObject({
			access_token: expect.any(String),
			refresh_token: expect.any(String),
			issuer: AUTHORIZATION_SERVER,
		});
		await reauthorizationConnection.client.close();

		const refreshToken = storage.tokens?.refresh_token;
		if (!refreshToken || !storage.client || !storage.discovery) {
			throw new Error("CIMD OAuth state was not persisted");
		}
		const refreshed = await refreshAuthorization(AUTHORIZATION_SERVER, {
			metadata: storage.discovery.authorizationServerMetadata,
			clientInformation: storage.client,
			refreshToken,
			resource: new URL(MCP_RESOURCE),
			fetchFn: routeFetch,
		});
		expect(refreshed.access_token).not.toBe(storage.tokens?.access_token);
		expect(refreshed.refresh_token).toBeTruthy();
		expect(tokenRequests.at(-1)?.get("resource")).toBe(MCP_RESOURCE);
		await storage.provider.saveTokens(
			{ ...refreshed, issuer: AUTHORIZATION_SERVER },
			{ issuer: AUTHORIZATION_SERVER },
		);
		expect(
			await connection.client.callTool({ name: "greet", arguments: {} }),
		).toMatchObject({
			content: [{ type: "text", text: "hello from CIMD" }],
		});
		expect(dcrRequestCount).toBe(0);
		await connection.client.close();
		await sdkHandler.close();
	});
});
