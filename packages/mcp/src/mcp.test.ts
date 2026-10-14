import { createResourceServerChallenge } from "@better-auth/oauth-provider";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import type {
	OAuthClientInformationContext,
	OAuthClientProvider,
	OAuthDiscoveryState,
	StoredOAuthClientInformation,
	StoredOAuthTokens,
} from "@modelcontextprotocol/client";
import {
	auth as authorizeMcpClient,
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
import { decodeJwt } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMcpProtectedRequestHandler, mcp } from "./index";

const AUTHORIZATION_SERVER = "https://auth.example.test";
const MCP_RESOURCE = "https://resource.example.test/mcp";
const REDIRECT_URI = "https://client.example.test/oauth/callback";
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

function createOAuthClientProvider(options?: { clientMetadataUrl?: string }) {
	let authorizationUrl: URL | undefined;
	let codeVerifier: string | undefined;
	let discoveryState: OAuthDiscoveryState | undefined;
	let latestClientInformation: StoredOAuthClientInformation | undefined;
	let latestTokens: StoredOAuthTokens | undefined;
	const clientInformationByIssuer = new Map<
		string,
		StoredOAuthClientInformation
	>();
	const tokensByIssuer = new Map<string, StoredOAuthTokens>();

	const provider: OAuthClientProvider = {
		redirectUrl: REDIRECT_URI,
		clientMetadataUrl: options?.clientMetadataUrl,
		clientMetadata: {
			client_name: "Better Auth MCP SDK v2 client",
			redirect_uris: [REDIRECT_URI],
			application_type: "native",
			token_endpoint_auth_method: "none",
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
		},
		state: () => "mcp-sdk-v2-state",
		clientInformation(context?: OAuthClientInformationContext) {
			return context
				? clientInformationByIssuer.get(context.issuer)
				: latestClientInformation;
		},
		saveClientInformation(clientInformation, context) {
			if (!context)
				throw new Error("client information issuer was not supplied");
			expect(clientInformation.issuer).toBe(context.issuer);
			clientInformationByIssuer.set(context.issuer, clientInformation);
			latestClientInformation = clientInformation;
		},
		tokens(context?: OAuthClientInformationContext) {
			return context ? tokensByIssuer.get(context.issuer) : latestTokens;
		},
		saveTokens(tokens, context) {
			if (!context) throw new Error("token issuer was not supplied");
			expect(tokens.issuer).toBe(context.issuer);
			tokensByIssuer.set(context.issuer, tokens);
			latestTokens = tokens;
		},
		redirectToAuthorization(url) {
			authorizationUrl = url;
		},
		saveCodeVerifier(value) {
			codeVerifier = value;
		},
		codeVerifier() {
			if (!codeVerifier) throw new Error("PKCE verifier was not persisted");
			return codeVerifier;
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
		get clientInformation() {
			return latestClientInformation;
		},
		get discoveryState() {
			return discoveryState;
		},
		get tokens() {
			return latestTokens;
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

describe("mcp", () => {
	const apiServerBaseUrl = "http://localhost:5000";
	const apiClient = createAuthClient({
		plugins: [oauthProviderClient(), oauthProviderResourceClient()],
		baseURL: apiServerBaseUrl,
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/9992
	 */
	it.for([
		{
			resource: apiServerBaseUrl,
			expected: `Bearer resource_metadata="${apiServerBaseUrl}/.well-known/oauth-protected-resource"`,
		},
		{
			resource: `${apiServerBaseUrl}/resource1`,
			expected: `Bearer resource_metadata="${apiServerBaseUrl}/.well-known/oauth-protected-resource/resource1"`,
		},
	])("provides the OAuth resource challenge for $resource", async ({
		resource,
		expected,
	}) => {
		try {
			await apiClient.verifyBearerToken("bad_access_token", {
				verifyOptions: {
					issuer: AUTHORIZATION_SERVER,
					audience: resource,
				},
				jwksUrl: `${AUTHORIZATION_SERVER}/api/auth/jwks`,
			});
			expect.unreachable();
		} catch (error) {
			const challenge = createResourceServerChallenge(error, resource);
			expect(challenge?.statusCode).toBe(401);
			expect(
				new Headers(challenge?.headers as HeadersInit).get("www-authenticate"),
			).toBe(expected);
		}
	});

	it("preserves the MCP challenge boundary", async () => {
		const response = await createMcpProtectedRequestHandler(
			{
				issuer: AUTHORIZATION_SERVER,
				audience: MCP_RESOURCE,
			},
			async () => new Response("unused"),
		)(new Request(MCP_RESOURCE));
		expect(response.status).toBe(401);
		expect(response.headers.get("www-authenticate")).toBe(
			'Bearer resource_metadata="https://resource.example.test/.well-known/oauth-protected-resource/mcp"',
		);
	});
});

describe("MCP SDK v2 explicit DCR flow", async () => {
	const requestedRegistrationDocuments: unknown[] = [];
	const tokenRequests: URLSearchParams[] = [];
	const insufficientScopeChallenges: string[] = [];
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
				allowDynamicClientRegistration: true,
				allowUnauthenticatedClientRegistration: true,
				scopes: ["openid", "offline_access", "mcp:base", "greeting"],
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
	const serverHandler = createMcpHandler(
		() => {
			const server = new McpServer({
				name: "better-auth-mcp-acceptance",
				version: "1.0.0",
			});
			server.registerTool("greet", {}, async () => ({
				content: [{ type: "text", text: "hello from protected MCP" }],
			}));
			return server;
		},
		{ legacy: "reject", responseMode: "json" },
	);
	const storage = createOAuthClientProvider();

	const routeFetch: FetchImplementation = async (input, init) => {
		const url = requestUrl(input);
		const request = new Request(input, init);
		if (
			url.origin === AUTHORIZATION_SERVER &&
			url.pathname === "/api/auth/oauth2/register"
		) {
			requestedRegistrationDocuments.push(await request.clone().json());
		}
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
		const response = await createMcpProtectedRequestHandler(
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
				return serverHandler.fetch(verifiedRequest, { authInfo });
			},
		)(request);
		if (response.status === 403) {
			const challenge = response.headers.get("www-authenticate");
			if (challenge) insufficientScopeChallenges.push(challenge);
		}
		return response;
	};

	afterEach(async () => {
		vi.unstubAllGlobals();
		requestedRegistrationDocuments.length = 0;
		tokenRequests.length = 0;
		insufficientScopeChallenges.length = 0;
	});

	async function completeAuthorization(authorizationUrl: URL): Promise<URL> {
		let location = "";
		await userClient.$fetch(authorizationUrl.toString(), {
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
		vi.stubGlobal("window", { location: { search: consentUrl.search } });
		const consent = await userClient.oauth2.consent(
			{ accept: true },
			{ headers, throw: true },
		);
		return new URL(consent.url);
	}

	function createSdkClientAndTransport() {
		const client = new Client(
			{ name: "better-auth-acceptance-client", version: "1.0.0" },
			{
				versionNegotiation: {
					mode: { pin: PROTOCOL_VERSION },
				},
			},
		);
		const transport = new StreamableHTTPClientTransport(new URL(MCP_RESOURCE), {
			authProvider: storage.provider,
			fetch: routeFetch,
		});
		return { client, transport };
	}

	it("registers, binds, negotiates 2026-07-28, steps up, invokes a tool, and refreshes", async () => {
		vi.stubGlobal("fetch", routeFetch);
		let connection = createSdkClientAndTransport();
		await expect(
			connection.client.connect(connection.transport),
		).rejects.toBeInstanceOf(UnauthorizedError);

		expect(storage.authorizationUrl).toBeDefined();
		expect(storage.authorizationUrl?.searchParams.get("resource")).toBe(
			MCP_RESOURCE,
		);
		expect(requestedRegistrationDocuments).toHaveLength(1);
		expect(requestedRegistrationDocuments[0]).not.toHaveProperty("resources");
		expect(storage.clientInformation).toMatchObject({
			client_id: expect.any(String),
			issuer: AUTHORIZATION_SERVER,
			scope: "openid offline_access mcp:base greeting",
		});
		expect(storage.discoveryState).toMatchObject({
			authorizationServerUrl: AUTHORIZATION_SERVER,
			resourceMetadata: {
				resource: MCP_RESOURCE,
				authorization_servers: [AUTHORIZATION_SERVER],
				scopes_supported: ["mcp:base", "greeting"],
			},
			authorizationServerMetadata: {
				issuer: AUTHORIZATION_SERVER,
				authorization_response_iss_parameter_supported: true,
			},
		});

		const callback = await completeAuthorization(storage.authorizationUrl!);
		expect(callback.searchParams.get("iss")).toBe(AUTHORIZATION_SERVER);
		await connection.transport.finishAuth(callback.searchParams);
		expect(tokenRequests.at(-1)?.get("resource")).toBe(MCP_RESOURCE);
		expect(storage.tokens).toMatchObject({
			access_token: expect.any(String),
			refresh_token: expect.any(String),
			scope: "mcp:base offline_access",
			issuer: AUTHORIZATION_SERVER,
		});
		await connection.client.close();

		connection = createSdkClientAndTransport();
		await connection.client.connect(connection.transport);
		expect(connection.transport.protocolVersion).toBe(PROTOCOL_VERSION);

		await expect(
			connection.client.callTool({ name: "greet", arguments: {} }),
		).rejects.toBeInstanceOf(UnauthorizedError);
		expect(insufficientScopeChallenges).toHaveLength(1);
		expect(insufficientScopeChallenges[0]).toContain(
			'error="insufficient_scope"',
		);
		expect(insufficientScopeChallenges[0]).toContain('scope="greeting"');
		expect(insufficientScopeChallenges[0]).not.toContain("mcp:base");
		expect(insufficientScopeChallenges[0]).not.toContain("offline_access");
		expect(storage.authorizationUrl?.searchParams.get("scope")).toBe(
			"mcp:base offline_access greeting",
		);
		expect(storage.authorizationUrl?.searchParams.get("resource")).toBe(
			MCP_RESOURCE,
		);
		const stepUpCallback = await completeAuthorization(
			storage.authorizationUrl!,
		);
		expect(stepUpCallback.searchParams.get("iss")).toBe(AUTHORIZATION_SERVER);
		await connection.transport.finishAuth(stepUpCallback.searchParams);
		expect(tokenRequests.at(-1)?.get("resource")).toBe(MCP_RESOURCE);

		const result = await connection.client.callTool({
			name: "greet",
			arguments: {},
		});
		expect(result.content).toEqual([
			{ type: "text", text: "hello from protected MCP" },
		]);
		const accessTokenBeforeRefresh = storage.tokens?.access_token;
		const refreshToken = storage.tokens?.refresh_token;
		if (
			!refreshToken ||
			!storage.clientInformation ||
			!storage.discoveryState
		) {
			throw new Error("OAuth state was not persisted");
		}
		const refreshed = await refreshAuthorization(AUTHORIZATION_SERVER, {
			metadata: storage.discoveryState.authorizationServerMetadata,
			clientInformation: storage.clientInformation,
			refreshToken,
			resource: new URL(MCP_RESOURCE),
			fetchFn: routeFetch,
		});
		expect(refreshed.access_token).not.toBe(accessTokenBeforeRefresh);
		expect(refreshed.refresh_token).toBeTruthy();
		expect(tokenRequests.at(-1)?.get("resource")).toBe(MCP_RESOURCE);
		expect(decodeJwt(refreshed.access_token).aud).toBe(MCP_RESOURCE);
		await connection.client.close();
		await serverHandler.close();
	});

	it("discards client credentials stamped for another issuer", async () => {
		const freshStorage = createOAuthClientProvider();
		const wrongIssuerClient = {
			client_id: "wrong-issuer-client",
			client_secret: "must-never-be-used",
			issuer: "https://other-issuer.example.test",
		};
		const provider: OAuthClientProvider = {
			...freshStorage.provider,
			clientInformation: (context) =>
				freshStorage.clientInformation ??
				(context ? wrongIssuerClient : undefined),
		};
		expect(
			await authorizeMcpClient(provider, {
				serverUrl: MCP_RESOURCE,
				fetchFn: routeFetch,
			}),
		).toBe("REDIRECT");
		expect(freshStorage.clientInformation).toMatchObject({
			client_id: expect.not.stringMatching(/^wrong-issuer-client$/),
			issuer: AUTHORIZATION_SERVER,
		});
		expect(JSON.stringify(requestedRegistrationDocuments)).not.toContain(
			wrongIssuerClient.client_secret,
		);
	});
});
