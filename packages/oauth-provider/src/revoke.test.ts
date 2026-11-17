import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { CompactEncrypt, compactDecrypt, errors as joseErrors } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthOptions, Scope } from "./types";
import type { OAuthClient } from "./types/oauth";

type MakeRequired<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

describe("oauth revoke", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const validResource = "https://myapi.example.com";
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt({
				jwt: {
					issuer: authServerBaseUrl,
				},
			}),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				resources: [validResource],
				enforcePerClientResources: false,
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

	let oauthClient: OAuthClient | null;

	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/callback/${providerId}`;
	const state = "123";

	async function createAuthUrl(
		overrides?: Partial<Parameters<typeof createAuthorizationURL>[0]>,
		targetClient: OAuthClient | null = oauthClient,
	) {
		if (!targetClient?.client_id || !targetClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}
		const codeVerifier = generateRandomString(32);
		const url = await createAuthorizationURL({
			id: providerId,
			options: {
				clientId: targetClient?.client_id,
				clientSecret: targetClient?.client_secret,
				redirectURI: redirectUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
			state,
			scopes: ["openid", "profile", "email", "offline_access"],
			codeVerifier,
			...overrides,
		});
		return {
			url,
			codeVerifier,
		};
	}

	async function validateAuthCode(
		overrides: MakeRequired<
			Partial<Parameters<typeof authorizationCodeRequest>[0]>,
			"code"
		>,
		targetClient: OAuthClient | null = oauthClient,
	) {
		if (!targetClient?.client_id || !targetClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const { body, headers } = await authorizationCodeRequest({
			...overrides,
			redirectURI: redirectUri,
			options: {
				clientId: targetClient.client_id,
				clientSecret: targetClient.client_secret,
				redirectURI: redirectUri,
			},
		});

		const tokens = await client.$fetch<{
			access_token?: string;
			id_token?: string;
			refresh_token?: string;
			expires_in?: number;
			expires_at?: number;
			token_type?: string;
			scope?: string;
			[key: string]: unknown;
		}>("/oauth2/token", {
			method: "POST",
			body: body,
			headers: headers,
		});

		return tokens;
	}

	async function getTokens(
		overrides?: Partial<Parameters<typeof createAuthUrl>[0]>,
		resource?: string,
		targetClient: OAuthClient | null = oauthClient,
	) {
		const { url: authUrl, codeVerifier } = await createAuthUrl(
			overrides,
			targetClient,
		);
		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		const url = new URL(callbackRedirectUrl);
		return await validateAuthCode(
			{
				code: url.searchParams.get("code")!,
				codeVerifier,
				resource,
			},
			targetClient,
		);
	}

	// Registers a confidential client application to work with
	beforeAll(async () => {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
				token_endpoint_auth_method: "client_secret_post",
				skip_consent: true,
			},
		});
		expect(response?.client_id).toBeDefined();
		expect(response?.user_id).toBeDefined();
		expect(response?.client_secret).toBeDefined();
		expect(response?.redirect_uris).toEqual([redirectUri]);
		oauthClient = response;
	});

	/**
	 * A 401 must carry a challenge, and a browser client must be able to read it.
	 * @see https://www.rfc-editor.org/rfc/rfc9110#section-15.5.2
	 */
	it("should fail unauthenticated request", async () => {
		const tokens = await getTokens();
		let responseHeaders: Headers | undefined;
		const revocation = await client.oauth2.revoke(
			{
				token: tokens.data?.access_token!,
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
				onError(context) {
					responseHeaders = context.response.headers;
				},
			},
		);
		expect(revocation.error?.status).toBe(401);
		expect(responseHeaders?.get("WWW-Authenticate")).toBe("Basic");
		expect(responseHeaders?.get("Access-Control-Expose-Headers")).toBe(
			"WWW-Authenticate",
		);
	});

	it("reports unsupported_token_type for a jwt access_token with token_type_hint access_token", async () => {
		const tokens = await getTokens(undefined, validResource);
		const revocation = await client.oauth2.revoke(
			{
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: tokens.data?.access_token!,
				token_type_hint: "access_token",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(revocation.error?.status).toBe(400);
		expect(revocation.error).toMatchObject({
			error: "unsupported_token_type",
		});
	});

	it("should pass verification with token_type_hint access_token and sent opaque access_token", async () => {
		const tokens = await getTokens();
		const revocation = await client.oauth2.revoke(
			{
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: tokens.data?.access_token!,
				token_type_hint: "access_token",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);
	});

	it("should fail with token_type_hint access_token and sent refresh_token", async () => {
		const tokens = await getTokens();
		const revocation = await client.oauth2.revoke(
			{
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: tokens.data?.refresh_token!,
				token_type_hint: "access_token",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(revocation.error?.status).toBe(400);
	});

	it("should pass verification with token_type_hint refresh_token and sent refresh_token", async () => {
		const tokens = await getTokens();
		const revocation = await client.oauth2.revoke(
			{
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: tokens.data?.refresh_token!,
				token_type_hint: "refresh_token",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);
	});

	it("should fail verification with token_type_hint refresh_token and sent access_token", async () => {
		const tokens = await getTokens();
		const revocation = await client.oauth2.revoke(
			{
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: tokens.data?.access_token!,
				token_type_hint: "refresh_token",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(revocation.error?.status).toBe(400);
	});

	it("reports unsupported_token_type for a jwt access_token without token_type_hint", async () => {
		const tokens = await getTokens(undefined, validResource);
		const revocation = await client.oauth2.revoke(
			{
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: tokens.data?.access_token!,
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(revocation.error?.status).toBe(400);
		expect(revocation.error).toMatchObject({
			error: "unsupported_token_type",
		});
	});

	it("should pass verification without token_type_hint and sent opaque access_token", async () => {
		const tokens = await getTokens();
		const revocation = await client.oauth2.revoke(
			{
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: tokens.data?.access_token!,
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);
	});

	it("should pass verification without token_type_hint and sent refresh_token", async () => {
		const tokens = await getTokens();
		const revocation = await client.oauth2.revoke(
			{
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: tokens.data?.refresh_token!,
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/12679
	 */
	it("does not invalidate presenting client's refresh family when revoking a foreign revoked token", async () => {
		const clientBResponse = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
				token_endpoint_auth_method: "client_secret_post",
				skip_consent: true,
			},
		});
		expect(clientBResponse?.client_id).toBeDefined();

		const tokensA = await getTokens();
		const tokensB = await getTokens(undefined, undefined, clientBResponse);

		const firstRefreshTokenA = tokensA.data?.refresh_token;
		const refreshTokenB = tokensB.data?.refresh_token;
		expect(firstRefreshTokenA).toBeDefined();
		expect(refreshTokenB).toBeDefined();

		// Client A rotates its refresh token, marking firstRefreshTokenA as revoked
		const refreshedA = await client.oauth2.token(
			{
				grant_type: "refresh_token",
				refresh_token: firstRefreshTokenA!,
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(refreshedA.data?.refresh_token).toBeDefined();
		expect(refreshedA.data?.refresh_token).not.toBe(firstRefreshTokenA);

		// Client B attempts to revoke Client A's already-revoked refresh token
		const revocation = await client.oauth2.revoke(
			{
				client_id: clientBResponse?.client_id,
				client_secret: clientBResponse?.client_secret,
				token: firstRefreshTokenA!,
				token_type_hint: "refresh_token",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(revocation.error?.status).toBe(400);
		expect(revocation.error).toMatchObject({
			error: "invalid_request",
			error_description: "refresh token revoked",
		});

		// Client B's own refresh token family must NOT have been invalidated
		const refreshedB = await client.oauth2.token(
			{
				grant_type: "refresh_token",
				refresh_token: refreshTokenB!,
				client_id: clientBResponse?.client_id,
				client_secret: clientBResponse?.client_secret,
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(refreshedB.data?.refresh_token).toBeDefined();
		expect(refreshedB.error).toBe(null);
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc9700#section-4.14.2
	 */
	it("invalidates the refresh family when the owning client presents its own revoked token", async () => {
		const tokens = await getTokens();
		const firstRefreshToken = tokens.data?.refresh_token;
		expect(firstRefreshToken).toBeDefined();

		const refreshed = await client.oauth2.token(
			{
				grant_type: "refresh_token",
				refresh_token: firstRefreshToken!,
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		const currentRefreshToken = refreshed.data?.refresh_token;
		expect(currentRefreshToken).toBeDefined();

		const revocation = await client.oauth2.revoke(
			{
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: firstRefreshToken!,
				token_type_hint: "refresh_token",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(revocation.error?.status).toBe(400);

		const reused = await client.oauth2.token(
			{
				grant_type: "refresh_token",
				refresh_token: currentRefreshToken!,
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(reused.error?.status).toBe(400);
	});
});

describe("oauth revoke - config", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const validResource = "https://myapi.example.com";
	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/callback/${providerId}`;
	const scopes = [
		"openid",
		"email",
		"profile",
		"offline_access",
		"read:profile",
	];

	async function createTestInstance(opts?: {
		oauthProviderConfig?: Omit<
			OAuthOptions<Scope[]>,
			"loginPage" | "consentPage"
		>;
	}) {
		const clientCredentialsScopes = (
			opts?.oauthProviderConfig?.scopes ?? scopes
		).filter(
			(scope) =>
				!["openid", "profile", "email", "offline_access"].includes(scope),
		);
		const { auth, customFetchImpl, signInWithTestUser } = await getTestInstance(
			{
				baseURL: authServerBaseUrl,
				plugins: [
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						resources: [validResource],
						enforcePerClientResources: false,
						scopes,
						clientPrivileges: ({ action }) =>
							action === "create" ||
							action === "configure-client-credentials-scopes",
						...opts?.oauthProviderConfig,
					}),
					...(opts?.oauthProviderConfig?.disableJwtPlugin
						? []
						: [
								jwt({
									jwt: {
										issuer: authServerBaseUrl,
									},
								}),
							]),
				],
			},
		);
		const { headers } = await signInWithTestUser();
		const client = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: {
				customFetchImpl,
				headers,
			},
		});

		const registeredClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				grant_types: [
					"authorization_code",
					"client_credentials",
					"refresh_token",
				],
				token_endpoint_auth_method: "client_secret_post",
				redirect_uris: [redirectUri],
				application_type: "native",
				skip_consent: true,
				client_credentials_scopes: clientCredentialsScopes,
			},
		});

		return {
			client,
			oauthClient: registeredClient,
		};
	}

	async function createAuthUrl(
		oauthClient: OAuthClient,
		overrides?: Partial<Parameters<typeof createAuthorizationURL>[0]>,
	) {
		const codeVerifier = generateRandomString(32);
		const url = await createAuthorizationURL({
			id: providerId,
			options: {
				clientId: oauthClient?.client_id,
				clientSecret: oauthClient?.client_secret,
				redirectURI: redirectUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
			state: "123",
			scopes: ["openid", "profile", "email", "offline_access"],
			codeVerifier,
			...overrides,
		});
		return {
			url,
			codeVerifier,
		};
	}

	it("should pass with the correct opaqueAccessTokenPrefix", async () => {
		const prefix = "hello_";
		const testScopes = ["read:profile"];
		const { client, oauthClient } = await createTestInstance({
			oauthProviderConfig: {
				prefix: {
					opaqueAccessToken: prefix,
				},
				scopes: testScopes,
			},
		});
		const tokens = await client.oauth2.token(
			{
				grant_type: "client_credentials",
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				scope: testScopes.join(" "),
				redirect_uri: redirectUri,
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(tokens.data?.access_token?.startsWith(prefix)).toBeTruthy();

		const revocation = await client.oauth2.revoke(
			{
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: tokens.data?.access_token ?? "",
				token_type_hint: "access_token",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);
	});

	it("should pass with the correct refreshTokenPrefix", async () => {
		const refreshTokenPrefix = "hello_rt_";
		const testScopes = ["openid", "offline_access"];
		const { client, oauthClient } = await createTestInstance({
			oauthProviderConfig: {
				prefix: {
					refreshToken: refreshTokenPrefix,
				},
				scopes: testScopes,
			},
		});
		if (!oauthClient) expect.unreachable();

		const { url: authUrl, codeVerifier } = await createAuthUrl(oauthClient, {
			scopes: testScopes,
		});
		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		const url = new URL(callbackRedirectUrl);
		const tokens = await client.oauth2.token(
			{
				grant_type: "authorization_code",
				code: url.searchParams.get("code") ?? undefined,
				code_verifier: codeVerifier,
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				scope: testScopes.join(" "),
				redirect_uri: redirectUri,
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		if ("refresh_token" in (tokens.data ?? {})) {
			expect(
				(tokens.data as { refresh_token?: string }).refresh_token?.startsWith(
					refreshTokenPrefix,
				),
			).toBeTruthy();
		} else {
			expect.unreachable();
		}

		const revocation = await client.oauth2.revoke(
			{
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				// @ts-expect-error refresh token sent
				token: tokens.data?.refresh_token,
				token_type_hint: "refresh_token",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);
	});

	/**
	 * A `formatRefreshToken` built on JWE rejects any value that is not a
	 * compact JWE with a jose error. That rejection means the value is not a
	 * refresh token, so revocation answers as it does for any unknown token
	 * instead of failing with a server error.
	 * @see https://datatracker.ietf.org/doc/html/rfc7009#section-2.2
	 */
	describe("formatRefreshToken rejects a value it cannot decode", async () => {
		const key = new Uint8Array(32).fill(7);
		const testScopes = ["openid", "offline_access"];
		const { client, oauthClient } = await createTestInstance({
			oauthProviderConfig: {
				scopes: testScopes,
				formatRefreshToken: {
					encrypt: async (token, sessionId) =>
						new CompactEncrypt(
							new TextEncoder().encode(JSON.stringify({ token, sessionId })),
						)
							.setProtectedHeader({ alg: "A256KW", enc: "A256GCM" })
							.encrypt(key),
					decrypt: async (token) => {
						const { plaintext } = await compactDecrypt(token, key);
						return JSON.parse(new TextDecoder().decode(plaintext));
					},
				},
			},
		});
		if (!oauthClient) expect.unreachable();

		const formHeaders = {
			accept: "application/json",
			"content-type": "application/x-www-form-urlencoded",
		};

		async function getTokens() {
			const { url: authUrl, codeVerifier } = await createAuthUrl(oauthClient!, {
				scopes: testScopes,
			});
			let callbackRedirectUrl = "";
			await client.$fetch(authUrl.toString(), {
				onError(context) {
					callbackRedirectUrl = context.response.headers.get("Location") || "";
				},
			});
			const url = new URL(callbackRedirectUrl);
			const tokens = await client.oauth2.token(
				{
					grant_type: "authorization_code",
					code: url.searchParams.get("code") ?? undefined,
					code_verifier: codeVerifier,
					client_id: oauthClient?.client_id,
					client_secret: oauthClient?.client_secret,
					scope: testScopes.join(" "),
					redirect_uri: redirectUri,
				},
				{ headers: formHeaders },
			);
			return tokens.data as { access_token?: string; refresh_token?: string };
		}

		function revoke(
			token: string,
			token_type_hint?: "access_token" | "refresh_token",
		) {
			return client.oauth2.revoke(
				{
					client_id: oauthClient?.client_id,
					client_secret: oauthClient?.client_secret,
					token,
					token_type_hint,
				},
				{ headers: formHeaders },
			);
		}

		it.each([undefined, "refresh_token"] as const)(
			"answers an unknown token with token_type_hint %s as it does without a format",
			async (token_type_hint) => {
				const revocation = await revoke("bogus", token_type_hint);
				expect(revocation.error?.status).toBe(400);
			},
		);

		it("answers an access_token sent with token_type_hint refresh_token as a wrong hint", async () => {
			const tokens = await getTokens();
			const revocation = await revoke(tokens.access_token!, "refresh_token");
			expect(revocation.error?.status).toBe(400);
		});

		it("still revokes a valid refresh_token", async () => {
			const tokens = await getTokens();
			expect(tokens.refresh_token?.split(".")).toHaveLength(5);
			const revocation = await revoke(tokens.refresh_token!);
			expect(revocation.error).toBe(null);
		});
	});

	/**
	 * Only a value the format rejects is "not a refresh token". A failure of the
	 * decoder itself, such as an unreachable key service, is a server error.
	 */
	describe("formatRefreshToken fails for another reason", async () => {
		let failure: Error = new Error("key service unavailable");
		const testScopes = ["openid", "offline_access"];
		const { client, oauthClient } = await createTestInstance({
			oauthProviderConfig: {
				scopes: testScopes,
				formatRefreshToken: {
					encrypt: (token) => `enc.${token}`,
					decrypt: () => {
						throw failure;
					},
				},
			},
		});

		it.each([
			[undefined, "a plain error"],
			["refresh_token", "a plain error"],
			[undefined, "a key set timeout"],
			["refresh_token", "a key set timeout"],
		] as const)(
			"returns a server error for token_type_hint %s and %s",
			async (token_type_hint, kind) => {
				failure =
					kind === "a key set timeout"
						? new joseErrors.JWKSTimeout()
						: new Error("key service unavailable");
				const revocation = await client.oauth2.revoke(
					{
						client_id: oauthClient?.client_id,
						client_secret: oauthClient?.client_secret,
						token: "bogus",
						token_type_hint,
					},
					{
						headers: {
							accept: "application/json",
							"content-type": "application/x-www-form-urlencoded",
						},
					},
				);
				expect(revocation.error?.status).toBe(500);
			},
		);
	});
});
