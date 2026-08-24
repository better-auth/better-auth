import {
	CLIENT_ASSERTION_TYPE,
	signPrivateKeyJwtClientAssertion,
} from "@better-auth/core/oauth2";
import type { SchemaClient, Scope } from "@better-auth/oauth-provider";
import { oauthProvider } from "@better-auth/oauth-provider";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/client";
import { toNodeHandler } from "better-auth/node";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
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
import { cimd } from "./index";

const PKCE_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const PKCE_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

function buildAuthorizeUrl(
	base: string,
	clientIdUrl: string,
	redirectUri: string,
): string {
	return (
		`${base}/api/auth/oauth2/authorize` +
		`?client_id=${encodeURIComponent(clientIdUrl)}` +
		`&response_type=code` +
		`&redirect_uri=${encodeURIComponent(redirectUri)}` +
		`&scope=openid` +
		`&code_challenge=${PKCE_CHALLENGE}` +
		`&code_challenge_method=S256`
	);
}

function stubMetadataFetch(
	url: string,
	document: Record<string, unknown>,
): void {
	const originalFetch = globalThis.fetch.bind(globalThis);
	vi.stubGlobal(
		"fetch",
		vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			const requested =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.href
						: input.url;
			if (requested === url) {
				return Promise.resolve(
					new Response(JSON.stringify(document), {
						status: 200,
						headers: { "content-type": "application/json" },
					}),
				);
			}
			return originalFetch(input, init);
		}),
	);
}

async function extractAuthorizationCode(
	authedClient: ReturnType<
		typeof createAuthClient<{
			plugins: [ReturnType<typeof oauthProviderClient>];
		}>
	>,
	authorizeUrl: string,
): Promise<string> {
	let redirect = "";
	await authedClient.$fetch(authorizeUrl, {
		method: "GET",
		onError(ctx) {
			redirect = ctx.response.headers.get("Location") || "";
		},
	});

	// If prior consent exists, the server skips the consent page and
	// redirects straight to the client's redirect_uri with `code=...`.
	const redirectParams = tryExtractCodeFromUrl(redirect);
	if (redirectParams) return redirectParams;

	if (!redirect.includes("/consent")) {
		throw new Error(`Expected consent or callback redirect, got: ${redirect}`);
	}

	const baseURL = new URL(authorizeUrl).origin;
	vi.stubGlobal("window", {
		location: { search: new URL(redirect, baseURL).search },
	});

	const consent = await authedClient.oauth2.consent(
		{ accept: true },
		{ throw: true },
	);
	const url = new URL(consent.url);
	const code = url.searchParams.get("code");
	if (!code) throw new Error(`No code in redirect: ${consent.url}`);
	return code;
}

function tryExtractCodeFromUrl(urlString: string): string | null {
	if (!urlString) return null;
	try {
		const url = new URL(urlString);
		return url.searchParams.get("code");
	} catch {
		return null;
	}
}

describe("CIMD - token exchange flow", async () => {
	const port = 3102;
	const authServerBaseUrl = `http://localhost:${port}`;
	const clientMetadataUrl =
		"https://mcp-client-token.example.com/client-metadata.json";
	const redirectUri = "http://localhost:5102/callback";
	const metadataDocument = {
		client_id: clientMetadataUrl,
		client_name: "Token Exchange Test Client",
		redirect_uris: [redirectUri],
		token_endpoint_auth_method: "none",
		application_type: "native",
		grant_types: ["authorization_code"],
		response_types: ["code"],
	};
	const fetchClientMetadataResource = vi.fn(
		(input: RequestInfo | URL, init?: RequestInit) =>
			globalThis.fetch(input, init),
	);

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
				scopes: ["openid", "profile", "email", "offline_access"],
			}),
			cimd({
				fetchClientMetadataResource,
			}),
		],
	});

	let server: Listener;
	beforeAll(async () => {
		server = await listen(
			(req, res) => toNodeHandler(authorizationServer.handler)(req, res),
			{ port },
		);
	});
	afterAll(async () => {
		await server.close();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		fetchClientMetadataResource.mockClear();
	});

	async function exchangeWithUnsafeJwksResponse(
		responseKind: "redirected" | "wrong-mime" | "oversized",
	): Promise<{
		body: Record<string, unknown>;
		status: number;
		jwksUri: string;
	}> {
		const clientMetadataUrl = `https://${responseKind}-key-client.example.com/client-metadata.json`;
		const jwksUri = `https://${responseKind}-key-client.example.com/.well-known/jwks.json`;
		const redirectUri = `http://localhost:${5200 + responseKind.length}/callback`;
		const keyId = `${responseKind}-key`;
		const { privateKey, publicKey } = (await crypto.subtle.generateKey(
			{
				name: "RSASSA-PKCS1-v1_5",
				modulusLength: 2048,
				publicExponent: new Uint8Array([1, 0, 1]),
				hash: "SHA-256",
			},
			true,
			["sign", "verify"],
		)) as CryptoKeyPair;
		const privateKeyJwk = await crypto.subtle.exportKey("jwk", privateKey);
		const publicKeyJwk = await crypto.subtle.exportKey("jwk", publicKey);
		const jwks = {
			keys: [
				{
					...publicKeyJwk,
					kid: keyId,
					alg: "RS256",
					use: "sig",
				},
			],
		};
		const originalFetch = globalThis.fetch.bind(globalThis);
		vi.stubGlobal(
			"fetch",
			vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
				const requestedUrl =
					typeof input === "string"
						? input
						: input instanceof URL
							? input.href
							: input.url;
				if (requestedUrl === clientMetadataUrl) {
					return Promise.resolve(
						Response.json({
							client_id: clientMetadataUrl,
							client_name: `${responseKind} JWKS Client`,
							redirect_uris: [redirectUri],
							token_endpoint_auth_method: "private_key_jwt",
							application_type: "native",
							grant_types: ["authorization_code"],
							response_types: ["code"],
							jwks_uri: jwksUri,
						}),
					);
				}
				if (requestedUrl === jwksUri) {
					if (responseKind === "redirected") {
						const response = Response.json(jwks);
						Object.defineProperty(response, "redirected", { value: true });
						return Promise.resolve(response);
					}
					if (responseKind === "wrong-mime") {
						return Promise.resolve(
							new Response(JSON.stringify(jwks), {
								headers: { "content-type": "text/plain" },
							}),
						);
					}
					return Promise.resolve(
						Response.json({
							...jwks,
							padding: "x".repeat(70 * 1024),
						}),
					);
				}
				return originalFetch(input, init);
			}),
		);

		const { headers } = await signInWithTestUser();
		const authedClient = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: { customFetchImpl, headers },
		});
		const code = await extractAuthorizationCode(
			authedClient,
			buildAuthorizeUrl(authServerBaseUrl, clientMetadataUrl, redirectUri),
		);
		const tokenEndpoint = `${authServerBaseUrl}/api/auth/oauth2/token`;
		const assertion = await signPrivateKeyJwtClientAssertion({
			clientId: clientMetadataUrl,
			tokenEndpoint,
			privateKeyJwk,
			kid: keyId,
			algorithm: "RS256",
		});
		const tokenResponse = await fetch(tokenEndpoint, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
				client_id: clientMetadataUrl,
				client_assertion_type: CLIENT_ASSERTION_TYPE,
				client_assertion: assertion,
				code_verifier: PKCE_VERIFIER,
			}).toString(),
		});
		return {
			body: (await tokenResponse.json()) as Record<string, unknown>,
			status: tokenResponse.status,
			jwksUri,
		};
	}

	it("exchanges an authorization code for an access token", async () => {
		stubMetadataFetch(clientMetadataUrl, metadataDocument);

		const { headers } = await signInWithTestUser();
		const authedClient = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: { customFetchImpl, headers },
		});

		const code = await extractAuthorizationCode(
			authedClient,
			buildAuthorizeUrl(authServerBaseUrl, clientMetadataUrl, redirectUri),
		);

		const tokenResponse = await fetch(
			`${authServerBaseUrl}/api/auth/oauth2/token`,
			{
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "authorization_code",
					code,
					redirect_uri: redirectUri,
					client_id: clientMetadataUrl,
					code_verifier: PKCE_VERIFIER,
				}).toString(),
			},
		);

		expect(tokenResponse.status).toBe(200);
		const body = (await tokenResponse.json()) as Record<string, unknown>;
		expect(typeof body.access_token).toBe("string");
		expect(body.token_type).toBe("Bearer");
		expect(typeof body.expires_in).toBe("number");
	});

	it("authenticates an uppercase URL client_id with a same-origin jwks_uri", async () => {
		const uppercaseClientMetadataUrl =
			"HTTPS://key-client.example.com/client-metadata.json";
		const jwksUri = "https://key-client.example.com/.well-known/jwks.json";
		const keyId = "uppercase-url-client-key";
		const { privateKey, publicKey } = (await crypto.subtle.generateKey(
			{
				name: "RSASSA-PKCS1-v1_5",
				modulusLength: 2048,
				publicExponent: new Uint8Array([1, 0, 1]),
				hash: "SHA-256",
			},
			true,
			["sign", "verify"],
		)) as CryptoKeyPair;
		const privateKeyJwk = await crypto.subtle.exportKey("jwk", privateKey);
		const publicKeyJwk = await crypto.subtle.exportKey("jwk", publicKey);
		const privateKeyRedirectUri = "http://localhost:5106/callback";
		const originalFetch = globalThis.fetch.bind(globalThis);
		vi.stubGlobal(
			"fetch",
			vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
				const requested =
					typeof input === "string"
						? input
						: input instanceof URL
							? input.href
							: input.url;
				if (requested === uppercaseClientMetadataUrl) {
					return Promise.resolve(
						new Response(
							JSON.stringify({
								client_id: uppercaseClientMetadataUrl,
								client_name: "Uppercase URL Client",
								redirect_uris: [privateKeyRedirectUri],
								token_endpoint_auth_method: "private_key_jwt",
								application_type: "native",
								grant_types: ["authorization_code"],
								response_types: ["code"],
								jwks_uri: jwksUri,
							}),
							{
								status: 200,
								headers: { "content-type": "application/json" },
							},
						),
					);
				}
				if (requested === jwksUri) {
					return Promise.resolve(
						new Response(
							JSON.stringify({
								keys: [
									{
										...publicKeyJwk,
										kid: keyId,
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
			}),
		);

		const { headers } = await signInWithTestUser();
		const authedClient = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: { customFetchImpl, headers },
		});
		const code = await extractAuthorizationCode(
			authedClient,
			buildAuthorizeUrl(
				authServerBaseUrl,
				uppercaseClientMetadataUrl,
				privateKeyRedirectUri,
			),
		);
		const tokenEndpoint = `${authServerBaseUrl}/api/auth/oauth2/token`;
		const assertion = await signPrivateKeyJwtClientAssertion({
			clientId: uppercaseClientMetadataUrl,
			tokenEndpoint,
			privateKeyJwk,
			kid: keyId,
			algorithm: "RS256",
		});

		const tokenResponse = await fetch(tokenEndpoint, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: privateKeyRedirectUri,
				client_id: uppercaseClientMetadataUrl,
				client_assertion_type: CLIENT_ASSERTION_TYPE,
				client_assertion: assertion,
				code_verifier: PKCE_VERIFIER,
			}).toString(),
		});

		expect(tokenResponse.status).toBe(200);
		const body = (await tokenResponse.json()) as Record<string, unknown>;
		expect(typeof body.access_token).toBe("string");
		const discoveryFetchUrls = fetchClientMetadataResource.mock.calls.map(
			([input]) =>
				typeof input === "string"
					? input
					: input instanceof URL
						? input.href
						: input.url,
		);
		expect(discoveryFetchUrls).toContain(uppercaseClientMetadataUrl);
		expect(discoveryFetchUrls).toContain(jwksUri);
	});

	it.each([
		"redirected",
		"wrong-mime",
		"oversized",
	] as const)("rejects a %s discovery-owned JWKS response", async (responseKind) => {
		const result = await exchangeWithUnsafeJwksResponse(responseKind);
		expect(
			fetchClientMetadataResource.mock.calls.some(([input]) => {
				const requestedUrl =
					typeof input === "string"
						? input
						: input instanceof URL
							? input.href
							: input.url;
				return requestedUrl === result.jwksUri;
			}),
		).toBe(true);
		expect(result).toMatchObject({
			status: expect.toSatisfy((status: number) => status >= 400),
		});
	});

	it("returns user claims from /oauth2/userinfo with a CIMD-issued access token", async () => {
		stubMetadataFetch(clientMetadataUrl, metadataDocument);

		const { headers, user } = await signInWithTestUser();
		const authedClient = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: { customFetchImpl, headers },
		});

		const authorizeWithEmail =
			`${authServerBaseUrl}/api/auth/oauth2/authorize` +
			`?client_id=${encodeURIComponent(clientMetadataUrl)}` +
			`&response_type=code` +
			`&redirect_uri=${encodeURIComponent(redirectUri)}` +
			`&scope=${encodeURIComponent("openid email profile")}` +
			`&code_challenge=${PKCE_CHALLENGE}` +
			`&code_challenge_method=S256`;

		const code = await extractAuthorizationCode(
			authedClient,
			authorizeWithEmail,
		);

		const tokenResponse = await fetch(
			`${authServerBaseUrl}/api/auth/oauth2/token`,
			{
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "authorization_code",
					code,
					redirect_uri: redirectUri,
					client_id: clientMetadataUrl,
					code_verifier: PKCE_VERIFIER,
				}).toString(),
			},
		);
		const token = (await tokenResponse.json()) as Record<string, unknown>;
		expect(typeof token.access_token).toBe("string");

		const userinfoResponse = await fetch(
			`${authServerBaseUrl}/api/auth/oauth2/userinfo`,
			{
				headers: { Authorization: `Bearer ${token.access_token as string}` },
			},
		);
		expect(userinfoResponse.status).toBe(200);
		const claims = (await userinfoResponse.json()) as Record<string, unknown>;
		expect(typeof claims.sub).toBe("string");
		expect(claims.email).toBe(user.email);
	});

	it("refresh token grant mints a new access token for a CIMD client", async () => {
		stubMetadataFetch(clientMetadataUrl, metadataDocument);

		const { headers } = await signInWithTestUser();
		const authedClient = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: { customFetchImpl, headers },
		});

		// Request offline_access so the token response includes a refresh_token.
		const authorizeWithOffline =
			`${authServerBaseUrl}/api/auth/oauth2/authorize` +
			`?client_id=${encodeURIComponent(clientMetadataUrl)}` +
			`&response_type=code` +
			`&redirect_uri=${encodeURIComponent(redirectUri)}` +
			`&scope=${encodeURIComponent("openid offline_access")}` +
			`&code_challenge=${PKCE_CHALLENGE}` +
			`&code_challenge_method=S256`;

		const code = await extractAuthorizationCode(
			authedClient,
			authorizeWithOffline,
		);

		const initial = await fetch(`${authServerBaseUrl}/api/auth/oauth2/token`, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
				client_id: clientMetadataUrl,
				code_verifier: PKCE_VERIFIER,
			}).toString(),
		});
		const initialBody = (await initial.json()) as Record<string, unknown>;
		expect(typeof initialBody.access_token).toBe("string");
		expect(typeof initialBody.refresh_token).toBe("string");

		const refreshed = await fetch(
			`${authServerBaseUrl}/api/auth/oauth2/token`,
			{
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "refresh_token",
					refresh_token: initialBody.refresh_token as string,
					client_id: clientMetadataUrl,
				}).toString(),
			},
		);

		expect(refreshed.status).toBe(200);
		const refreshedBody = (await refreshed.json()) as Record<string, unknown>;
		expect(typeof refreshedBody.access_token).toBe("string");
		expect(refreshedBody.access_token).not.toBe(initialBody.access_token);
	});
});

describe("CIMD - refresh preserves admin-set flags", async () => {
	const port = 3103;
	const authServerBaseUrl = `http://localhost:${port}`;
	const clientMetadataUrl =
		"https://mcp-client-refresh.example.com/client-metadata.json";
	const redirectUri = "http://localhost:5103/callback";
	const metadataDocument = {
		client_id: clientMetadataUrl,
		client_name: "Refresh Preserve Test Client",
		redirect_uris: [redirectUri],
		token_endpoint_auth_method: "none",
		application_type: "native",
		grant_types: ["authorization_code", "client_credentials"],
		response_types: ["code"],
	};
	const onClientRefreshed = vi.fn(() => {
		throw new Error("notification sink unavailable");
	});

	// metadataRevalidationInterval: 0 makes every request stale, so the refresh path fires
	// on the second authorize hit — giving us a deterministic way to test
	// what refresh does (or does not) write.
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
				scopes: [
					"openid",
					"profile",
					"email",
					"offline_access",
					"service:read",
				],
				clientPrivileges: ({ action }) =>
					action === "update" ||
					action === "configure-client-credentials-scopes",
			}),
			cimd({
				metadataRevalidationInterval: 0,
				metadataFetchPolicy: { minimumFetchInterval: 0 },
				fetchClientMetadataResource: (input, init) =>
					globalThis.fetch(input, init),
				onClientRefreshed,
			}),
		],
	});

	let server: Listener;
	beforeAll(async () => {
		server = await listen(
			(req, res) => toNodeHandler(authorizationServer.handler)(req, res),
			{ port },
		);
	});
	afterAll(async () => {
		await server.close();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("preserves server-owned flags and client_credentials scope authority across a stale refresh", async () => {
		const { publicKey } = (await crypto.subtle.generateKey(
			{ name: "ECDSA", namedCurve: "P-256" },
			true,
			["sign", "verify"],
		)) as CryptoKeyPair;
		const publicKeyJwk = await crypto.subtle.exportKey("jwk", publicKey);
		stubMetadataFetch(clientMetadataUrl, {
			...metadataDocument,
			clientCredentialsScopes: ["admin"],
			client_credentials_scopes: ["admin"],
			name: "Ignored internal alias",
			token_endpoint_auth_method: "private_key_jwt",
			jwks: {
				keys: [
					{
						...publicKeyJwk,
						kid: "refresh-preserve-key",
						alg: "ES256",
						use: "sig",
					},
				],
			},
		});

		const { headers } = await signInWithTestUser();
		const authedClient = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: { customFetchImpl, headers },
		});

		// First authorize creates the CIMD client record.
		let redirect = "";
		await authedClient.$fetch(
			buildAuthorizeUrl(authServerBaseUrl, clientMetadataUrl, redirectUri),
			{
				method: "GET",
				onError(ctx) {
					redirect = ctx.response.headers.get("Location") || "";
				},
			},
		);
		expect(redirect).toContain("/consent");

		// A discovered declaration never grants machine-to-machine scopes.
		const ctx = await authorizationServer.$context;
		const discovered = await ctx.adapter.findOne<SchemaClient<Scope[]>>({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientMetadataUrl }],
		});
		expect(discovered?.clientCredentialsScopes).toEqual([]);

		// The administrative route is the only supported way to assign the
		// server-owned M2M ceiling on this unowned discovered client.
		const scopeUpdate = await authorizationServer.api.adminUpdateOAuthClient({
			headers,
			body: {
				client_id: clientMetadataUrl,
				update: {
					client_credentials_scopes: ["service:read"],
				},
			},
		});
		expect(scopeUpdate.client_credentials_scopes).toEqual(["service:read"]);

		// Admin-set lifecycle flags are modeled separately and remain protected
		// from metadata refresh as before.
		await ctx.adapter.update({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientMetadataUrl }],
			update: {
				disabled: true,
				skipConsent: true,
				enableEndSession: true,
			},
		});

		const afterAdmin = await ctx.adapter.findOne<SchemaClient<Scope[]>>({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientMetadataUrl }],
		});
		expect(afterAdmin).toMatchObject({
			disabled: true,
			skipConsent: true,
			enableEndSession: true,
			clientCredentialsScopes: ["service:read"],
		});

		// Second authorize must trigger a stale refresh (metadataRevalidationInterval: 0).
		// The document does NOT carry any of these flags, so preservation is
		// the only way they survive.
		await authedClient.$fetch(
			buildAuthorizeUrl(authServerBaseUrl, clientMetadataUrl, redirectUri),
			{ method: "GET", onError() {} },
		);

		const afterRefresh = await ctx.adapter.findOne<SchemaClient<Scope[]>>({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientMetadataUrl }],
		});
		expect(afterRefresh).toMatchObject({
			disabled: true,
			skipConsent: true,
			enableEndSession: true,
			clientCredentialsScopes: ["service:read"],
		});
		expect(onClientRefreshed).toHaveBeenCalledWith(
			expect.objectContaining({
				client: expect.objectContaining({
					clientId: clientMetadataUrl,
				}),
				previousClient: expect.objectContaining({
					disabled: true,
					skipConsent: true,
					enableEndSession: true,
					clientCredentialsScopes: ["service:read"],
				}),
				clientMetadataDocument: expect.objectContaining({
					client_id: clientMetadataUrl,
				}),
				context: expect.any(Object),
			}),
		);
	});
});

describe("CIMD - metadata document URL policy", async () => {
	const port = 3104;
	const authServerBaseUrl = `http://localhost:${port}`;
	const blockedClientUrl = "https://blocked.example.com/client-metadata.json";
	const allowedClientUrl = "https://allowed.example.com/client-metadata.json";
	const redirectUriBlocked = "http://localhost:5104/callback";
	const redirectUriAllowed = "http://localhost:5105/callback";

	const allowedDocument = {
		client_id: allowedClientUrl,
		client_name: "Allowed Fetch Client",
		redirect_uris: [redirectUriAllowed],
		token_endpoint_auth_method: "none",
		application_type: "native",
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
				scopes: ["openid", "profile", "email", "offline_access"],
			}),
			cimd({
				fetchClientMetadataResource: (input, init) =>
					globalThis.fetch(input, init),
				isMetadataDocumentUrlAllowed: (url) =>
					new URL(url).hostname === "allowed.example.com",
			}),
		],
	});

	let server: Listener;
	beforeAll(async () => {
		server = await listen(
			(req, res) => toNodeHandler(authorizationServer.handler)(req, res),
			{ port },
		);
	});
	afterAll(async () => {
		await server.close();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("rejects a URL blocked by isMetadataDocumentUrlAllowed before the fetch runs", async () => {
		const fetchSpy = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
			globalThis.fetch.call(globalThis, input, init),
		);
		vi.stubGlobal("fetch", fetchSpy);

		const { headers } = await signInWithTestUser();
		const authedClient = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: { customFetchImpl, headers },
		});

		let status = 0;
		await authedClient.$fetch(
			buildAuthorizeUrl(
				authServerBaseUrl,
				blockedClientUrl,
				redirectUriBlocked,
			),
			{
				method: "GET",
				onError(ctx) {
					status = ctx.response.status;
				},
			},
		);
		expect(status).toBeGreaterThanOrEqual(400);

		const metadataFetches = fetchSpy.mock.calls.filter((args) => {
			const input = args[0];
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.href
						: (input as Request).url;
			return url === blockedClientUrl;
		});
		expect(metadataFetches).toHaveLength(0);
	});

	it("allows a URL permitted by isMetadataDocumentUrlAllowed", async () => {
		stubMetadataFetch(allowedClientUrl, allowedDocument);

		const { headers } = await signInWithTestUser();
		const authedClient = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: { customFetchImpl, headers },
		});

		let redirect = "";
		await authedClient.$fetch(
			buildAuthorizeUrl(
				authServerBaseUrl,
				allowedClientUrl,
				redirectUriAllowed,
			),
			{
				method: "GET",
				onError(ctx) {
					redirect = ctx.response.headers.get("Location") || "";
				},
			},
		);
		expect(redirect).toContain("/consent");
	});
});
