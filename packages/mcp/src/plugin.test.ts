import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
	DPOP_SIGNING_ALGORITHMS,
	refreshAccessTokenRequest,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { beforeAll, describe, expect, it, onTestFinished, vi } from "vitest";
import { mcp, requireMcpAuth } from "./index";

describe("mcp plugin", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const baseURL = `${authServerBaseUrl}/api/auth`;

	// No custom jwt.issuer here, so discovery documents are served under the
	// `/api/auth` base path (issuer == baseURL), matching the public well-known
	// URLs an MCP client derives from the issuer.
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt(),
			mcp({
				loginPage: "/login",
				consentPage: "/consent",
				resource: baseURL,
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
	const unauthenticatedClient = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: {
			customFetchImpl,
		},
	});

	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/callback/${providerId}`;

	describe("dynamic client registration", () => {
		it("registers a public client without a client_secret", async () => {
			const response = await unauthenticatedClient.oauth2.register({
				client_name: "test-public-client",
				redirect_uris: [redirectUri],
				token_endpoint_auth_method: "none",
			});

			expect(response.data?.client_id).toBeDefined();
			expect(response.data?.token_endpoint_auth_method).toBe("none");
			expect(response.data).not.toHaveProperty("client_secret");
			expect(response.data).toMatchObject({
				grant_types: ["authorization_code"],
				response_types: ["code"],
			});
		});

		it("registers a confidential client with a client_secret", async () => {
			const response = await serverClient.oauth2.register({
				client_name: "test-confidential-client",
				redirect_uris: [redirectUri],
				token_endpoint_auth_method: "client_secret_basic",
			});

			expect(response.data?.client_id).toBeDefined();
			expect(response.data?.client_secret).toEqual(expect.any(String));
			expect(response.data?.token_endpoint_auth_method).toBe(
				"client_secret_basic",
			);
		});
	});

	describe("discovery metadata", () => {
		/**
		 * The authorization server metadata must never advertise the unsecured
		 * "none" id_token signing algorithm, which would let a client accept an
		 * unsigned ID token.
		 *
		 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-9h47-pqcx-hjr4
		 */
		it("advertises the /oauth2/* endpoints and never alg=none", async () => {
			const response = await customFetchImpl(
				`${baseURL}/.well-known/oauth-authorization-server`,
				{ method: "GET" },
			);
			expect(response.status).toBe(200);
			const metadata = (await response.json()) as {
				issuer: string;
				authorization_endpoint: string;
				token_endpoint: string;
				userinfo_endpoint: string;
				registration_endpoint: string;
				scopes_supported: string[];
				id_token_signing_alg_values_supported: string[];
			};

			expect(metadata).toMatchObject({
				issuer: baseURL,
				authorization_endpoint: `${baseURL}/oauth2/authorize`,
				token_endpoint: `${baseURL}/oauth2/token`,
				userinfo_endpoint: `${baseURL}/oauth2/userinfo`,
				registration_endpoint: `${baseURL}/oauth2/register`,
			});
			expect(metadata.scopes_supported).toContain("offline_access");
			expect(metadata.id_token_signing_alg_values_supported).not.toContain(
				"none",
			);
		});
	});

	describe("protected resource metadata", () => {
		/**
		 * @see https://github.com/better-auth/better-auth/pull/9992
		 */
		it("returns RFC 9728 protected resource metadata", async () => {
			const response = await customFetchImpl(
				`${authServerBaseUrl}/.well-known/oauth-protected-resource`,
				{ method: "GET" },
			);
			expect(response.status).toBe(200);
			const metadata = (await response.json()) as {
				resource: string;
				authorization_servers: string[];
				scopes_supported?: string[];
				bearer_methods_supported: string[];
				dpop_signing_alg_values_supported?: string[];
			};

			expect(metadata).toMatchObject({
				resource: baseURL,
				authorization_servers: [baseURL],
				bearer_methods_supported: ["header"],
				dpop_signing_alg_values_supported: [...DPOP_SIGNING_ALGORITHMS],
			});
			expect(metadata.scopes_supported).toBeUndefined();
		});

		/**
		 * @see https://github.com/better-auth/better-auth/pull/9992
		 */
		it("advertises resource scopes without authorization-server-only scopes", async () => {
			const resourceServerBaseUrl = "http://localhost:3010";
			const resourceBaseURL = `${resourceServerBaseUrl}/api/auth`;
			const { customFetchImpl: resourceFetch } = await getTestInstance({
				baseURL: resourceServerBaseUrl,
				plugins: [
					jwt(),
					mcp({
						loginPage: "/login",
						consentPage: "/consent",
						resource: resourceBaseURL,
						scopes: ["openid", "offline_access", "mcp:read"],
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
				],
			});

			const response = await resourceFetch(
				`${resourceServerBaseUrl}/.well-known/oauth-protected-resource`,
				{ method: "GET" },
			);
			expect(response.status).toBe(200);
			const metadata = (await response.json()) as {
				resource: string;
				authorization_servers: string[];
				scopes_supported?: string[];
				bearer_methods_supported: string[];
				dpop_signing_alg_values_supported?: string[];
			};

			expect(metadata).toMatchObject({
				resource: resourceBaseURL,
				authorization_servers: [resourceBaseURL],
				scopes_supported: ["mcp:read"],
				bearer_methods_supported: ["header"],
				dpop_signing_alg_values_supported: [...DPOP_SIGNING_ALGORITHMS],
			});
		});

		it("answers HEAD with metadata headers and an empty body", async () => {
			const response = await customFetchImpl(
				`${authServerBaseUrl}/.well-known/oauth-protected-resource`,
				{ method: "HEAD" },
			);
			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toContain(
				"application/json",
			);
			expect(await response.text()).toBe("");
		});

		it("rejects non-GET/HEAD methods with 405", async () => {
			const response = await customFetchImpl(
				`${authServerBaseUrl}/.well-known/oauth-protected-resource`,
				{ method: "POST" },
			);
			expect(response.status).toBe(405);
			expect(response.headers.get("allow")).toBe("GET, HEAD");
		});

		it("rejects a resource identifier that contains a URI fragment", () => {
			expect(() =>
				mcp({
					loginPage: "/login",
					consentPage: "/consent",
					resource: "https://api.example.com/mcp#fragment",
				}),
			).toThrow();
		});
	});

	describe("requireMcpAuth", () => {
		it("returns 401 with the resource_metadata header when unauthenticated", async () => {
			const response = await requireMcpAuth(auth, async () => {
				// Never reached: the request carries no bearer token.
				return new Response("unreachable");
			})(new Request(`${authServerBaseUrl}/mcp`));

			expect(response.status).toBe(401);
			expect(response.headers.get("WWW-Authenticate")).toBe(
				`Bearer resource_metadata="${authServerBaseUrl}/.well-known/oauth-protected-resource/api/auth"`,
			);
		});

		it("returns 401 for an invalid bearer token", async () => {
			const response = await requireMcpAuth(auth, async () => {
				return new Response("unreachable");
			})(
				new Request(`${authServerBaseUrl}/mcp`, {
					headers: { Authorization: "Bearer invalid-token" },
				}),
			);

			expect(response.status).toBe(401);
			expect(response.headers.get("WWW-Authenticate")).toBe(
				`Bearer resource_metadata="${authServerBaseUrl}/.well-known/oauth-protected-resource/api/auth"`,
			);
		});
	});

	describe("authorization code + PKCE flow", () => {
		let publicClientId: string;
		const state = "mcp-pkce-state";

		beforeAll(async () => {
			const reg = await unauthenticatedClient.oauth2.register({
				client_name: "test-pkce-client",
				redirect_uris: [redirectUri],
				token_endpoint_auth_method: "none",
			});
			if (!reg.data?.client_id) throw new Error("registration failed");
			publicClientId = reg.data.client_id;
		});

		it("mints an access token through authorize + consent + token exchange", async () => {
			const codeVerifier = generateRandomString(64);
			const authUrl = await createAuthorizationURL({
				id: providerId,
				options: {
					clientId: publicClientId,
					redirectURI: redirectUri,
				},
				redirectURI: "",
				authorizationEndpoint: `${baseURL}/oauth2/authorize`,
				state,
				scopes: ["openid", "offline_access"],
				codeVerifier,
			});

			let consentRedirectUrl = "";
			await serverClient.$fetch(authUrl.toString(), {
				method: "GET",
				onError(context) {
					consentRedirectUrl = context.response.headers.get("Location") || "";
				},
			});
			// Untrusted self-registered clients must pass through consent.
			expect(consentRedirectUrl).toContain("/consent");

			// The consent call re-signs the authorization query the server stashed
			// in the redirect search; the client reads it from window.location.
			vi.stubGlobal("window", {
				location: {
					search: new URL(consentRedirectUrl, authServerBaseUrl).search,
				},
			});
			onTestFinished(() => {
				vi.unstubAllGlobals();
			});

			const consentRes = await serverClient.oauth2.consent(
				{ accept: true },
				{ headers, throw: true },
			);
			expect(consentRes.url).toContain("code=");
			expect(consentRes.url).toContain(`state=${state}`);

			const code = new URL(consentRes.url).searchParams.get("code")!;
			const { body, headers: tokenHeaders } = await authorizationCodeRequest({
				code,
				codeVerifier,
				redirectURI: redirectUri,
				options: {
					clientId: publicClientId,
					redirectURI: redirectUri,
				},
			});

			// Exchange directly through customFetchImpl: the form-encoded token
			// request must not pass through the client hook that injects the
			// signed authorization query into the body.
			const tokenResponse = await customFetchImpl(`${baseURL}/oauth2/token`, {
				method: "POST",
				body: body.toString(),
				headers: tokenHeaders,
			});
			const tokens = (await tokenResponse.json()) as {
				access_token?: string;
				id_token?: string;
				refresh_token?: string;
				token_type?: string;
				scope?: string;
			};

			expect(tokens.access_token).toBeDefined();
			expect(tokens.id_token).toBeDefined();
			expect(tokens.refresh_token).toBeDefined();
			expect(tokens.token_type?.toLowerCase()).toBe("bearer");
			expect(tokens.scope).toBe("openid offline_access");
		});
	});
});

/**
 * The refresh_token grant on a confidential MCP client must authenticate the
 * client. A confidential client cannot refresh without its secret, with the
 * wrong secret, or while disabled; it must succeed when the secret is supplied
 * via `Authorization: Basic`.
 *
 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-pw9m-5jxm-xr6h
 */
describe("mcp refresh_token grant client authentication", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/callback/${providerId}`;
	const state = "mcp-refresh-state";

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt(),
			mcp({
				loginPage: "/login",
				consentPage: "/consent",
				resource: `${authServerBaseUrl}/api/auth`,
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
		],
	});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: {
			customFetchImpl,
			headers,
		},
	});

	let oauthClient: { client_id: string; client_secret: string };

	beforeAll(async () => {
		// A confidential client registered through DCR. Its default
		// authorization_code grant implicitly allows refresh_token.
		const created = await client.oauth2.register({
			client_name: "test-refresh-confidential-client",
			redirect_uris: [redirectUri],
			token_endpoint_auth_method: "client_secret_basic",
		});
		if (!created.data?.client_id || !created.data.client_secret) {
			throw new Error("client registration failed");
		}
		oauthClient = {
			client_id: created.data.client_id,
			client_secret: created.data.client_secret,
		};
	});

	/** Runs the real authorize + consent + token exchange to mint a refresh token. */
	async function mintRefreshToken(): Promise<string> {
		const codeVerifier = generateRandomString(64);
		const authUrl = await createAuthorizationURL({
			id: providerId,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
			state,
			scopes: ["openid", "offline_access"],
			codeVerifier,
		});

		let redirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(context) {
				redirectUrl = context.response.headers.get("Location") || "";
			},
		});

		// A prior grant for this client+user may let the authorize step skip
		// consent and return the code directly; only run consent when redirected.
		let codeRedirectUrl = redirectUrl;
		if (redirectUrl.includes("/consent")) {
			vi.stubGlobal("window", {
				location: {
					search: new URL(redirectUrl, authServerBaseUrl).search,
				},
			});
			const consentRes = await client.oauth2.consent(
				{ accept: true },
				{ headers, throw: true },
			);
			vi.unstubAllGlobals();
			codeRedirectUrl = consentRes.url;
		}

		const code = new URL(codeRedirectUrl, authServerBaseUrl).searchParams.get(
			"code",
		);
		if (!code) throw new Error("missing authorization code");

		const { body, headers: tokenHeaders } = await authorizationCodeRequest({
			code,
			codeVerifier,
			redirectURI: redirectUri,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
			},
		});
		const tokenResponse = await customFetchImpl(
			`${authServerBaseUrl}/api/auth/oauth2/token`,
			{
				method: "POST",
				body: body.toString(),
				headers: tokenHeaders,
			},
		);
		const tokens = (await tokenResponse.json()) as { refresh_token?: string };
		if (!tokens.refresh_token) {
			throw new Error("token exchange did not return a refresh token");
		}
		return tokens.refresh_token;
	}

	it("rejects refresh_token grant on a confidential client without client_secret", async () => {
		const refreshToken = await mintRefreshToken();
		const response = await customFetchImpl(
			`${authServerBaseUrl}/api/auth/oauth2/token`,
			{
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "refresh_token",
					refresh_token: refreshToken,
					client_id: oauthClient.client_id,
				}).toString(),
			},
		);
		const body = await response.json().catch(() => null);

		// A confidential client that omits its secret is rejected before any
		// token is issued (400, the secret is a required request parameter).
		expect(response.status).toBe(400);
		expect(body?.error).toBe("invalid_client");
		expect(body?.access_token).toBeUndefined();
	});

	it("rejects refresh_token grant on a confidential client with the wrong client_secret", async () => {
		const refreshToken = await mintRefreshToken();
		const response = await customFetchImpl(
			`${authServerBaseUrl}/api/auth/oauth2/token`,
			{
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "refresh_token",
					refresh_token: refreshToken,
					client_id: oauthClient.client_id,
					client_secret: "wrong-secret",
				}).toString(),
			},
		);
		const body = await response.json().catch(() => null);

		expect(response.status).toBe(401);
		expect(body?.error).toBe("invalid_client");
		expect(body?.access_token).toBeUndefined();
	});

	it("accepts refresh_token grant when client_secret comes via Authorization: Basic", async () => {
		const refreshToken = await mintRefreshToken();
		const basic = `Basic ${Buffer.from(
			`${oauthClient.client_id}:${oauthClient.client_secret}`,
		).toString("base64")}`;
		const response = await customFetchImpl(
			`${authServerBaseUrl}/api/auth/oauth2/token`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					authorization: basic,
				},
				body: new URLSearchParams({
					grant_type: "refresh_token",
					refresh_token: refreshToken,
				}).toString(),
			},
		);
		const body = await response.json().catch(() => null);

		expect(response.status).toBe(200);
		expect(body?.access_token).toBeDefined();
		expect(body?.refresh_token).toBeDefined();
	});

	it("rejects refresh_token grant when the confidential client is disabled", async () => {
		const refreshToken = await mintRefreshToken();
		const context = await auth.$context;
		await context.adapter.update({
			model: "oauthClient",
			where: [{ field: "clientId", value: oauthClient.client_id }],
			update: { disabled: true },
		});

		const response = await customFetchImpl(
			`${authServerBaseUrl}/api/auth/oauth2/token`,
			{
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "refresh_token",
					refresh_token: refreshToken,
					client_id: oauthClient.client_id,
					client_secret: oauthClient.client_secret,
				}).toString(),
			},
		);
		const body = await response.json().catch(() => null);

		// Re-enable so any later cases in this suite still operate on a live client.
		await context.adapter.update({
			model: "oauthClient",
			where: [{ field: "clientId", value: oauthClient.client_id }],
			update: { disabled: false },
		});

		// A disabled client is rejected outright (400) before token issuance.
		expect(response.status).toBe(400);
		expect(body?.error).toBe("invalid_client");
		expect(body?.access_token).toBeUndefined();
	});

	it("rotates the refresh token on a successful confidential refresh", async () => {
		const refreshToken = await mintRefreshToken();
		const { body, headers: refreshHeaders } = await refreshAccessTokenRequest({
			refreshToken,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
			},
		});
		const refreshed = await client.$fetch<{
			access_token?: string;
			refresh_token?: string;
		}>("/oauth2/token", {
			method: "POST",
			body,
			headers: refreshHeaders,
		});

		expect(refreshed.data?.access_token).toBeDefined();
		expect(refreshed.data?.refresh_token).toBeDefined();
		expect(refreshed.data?.refresh_token).not.toEqual(refreshToken);
	});
});
