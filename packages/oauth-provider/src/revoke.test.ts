import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
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
	) {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}
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
	) {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const { body, headers } = await authorizationCodeRequest({
			...overrides,
			redirectURI: redirectUri,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
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
	) {
		const { url: authUrl, codeVerifier } = await createAuthUrl(overrides);
		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		const url = new URL(callbackRedirectUrl);
		return await validateAuthCode({
			code: url.searchParams.get("code")!,
			codeVerifier,
			resource,
		});
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

	it("should fail unauthenticated request", async () => {
		const tokens = await getTokens();
		const revocation = await client.oauth2.revoke(
			{
				token: tokens.data?.access_token!,
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(revocation.error?.status).toBe(401);
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

	it("revokes a refresh token sent with the wrong token_type_hint (RFC 7009 section 2.2.1)", async () => {
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
		// RFC 7009 section 2.2.1: if the server is unable to locate the token
		// using the given hint, it MUST extend its search across all of its
		// supported token types. The hint only orders the search; it must not
		// turn a valid revocation into an error.
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);

		// The refresh token must actually be revoked: the refresh grant fails
		// with invalid_grant afterwards.
		if (!oauthClient?.client_id || !oauthClient.client_secret) {
			throw Error("beforeAll not run properly");
		}
		const refreshed = await client.$fetch<Record<string, unknown>>(
			"/oauth2/token",
			{
				method: "POST",
				body: new URLSearchParams({
					grant_type: "refresh_token",
					refresh_token: tokens.data?.refresh_token!,
					client_id: oauthClient.client_id,
					client_secret: oauthClient.client_secret,
				}),
				headers: {
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(refreshed.error?.status).toBe(400);
		expect((refreshed.error as { error?: string })?.error).toBe(
			"invalid_grant",
		);
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

	it("revokes an opaque access token sent with the wrong token_type_hint (RFC 7009 section 2.2.1)", async () => {
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
		// The hint only orders the search; the search extends across all
		// supported token types when the hinted lookup fails.
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);

		// The opaque access token must actually be revoked: introspection
		// reports it inactive afterwards.
		if (!oauthClient?.client_id || !oauthClient.client_secret) {
			throw Error("beforeAll not run properly");
		}
		const introspection = await client.$fetch<Record<string, unknown>>(
			"/oauth2/introspect",
			{
				method: "POST",
				body: new URLSearchParams({
					token: tokens.data?.access_token!,
					client_id: oauthClient.client_id,
					client_secret: oauthClient.client_secret,
				}),
				headers: {
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(introspection.data?.active).toBe(false);
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

	it("returns 200 for a nonexistent token (RFC 7009 section 2.2)", async () => {
		const revocation = await client.oauth2.revoke(
			{
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: "not-a-real-token",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		// RFC 7009 section 2.2: the server responds with 200 if the token has
		// been revoked successfully OR if the client submitted an invalid
		// token. An invalid token must not produce an error response.
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);
	});

	it("returns 200 for a nonexistent token with token_type_hint access_token", async () => {
		const revocation = await client.oauth2.revoke(
			{
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: "not-a-real-token",
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

	it("returns 200 for a nonexistent token with token_type_hint refresh_token", async () => {
		const revocation = await client.oauth2.revoke(
			{
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: "not-a-real-token",
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

	it("returns 200 when revoking an already-revoked refresh token", async () => {
		const tokens = await getTokens();
		{
			const first = await client.oauth2.revoke(
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
			expect(first.data).toBe(null);
			expect(first.error).toBe(null);
		}
		// Second revocation of the same (now revoked) token: the family
		// teardown still runs, but the response is 200 per RFC 7009.
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

	it("returns 200 for a refresh_token sent with token_type_hint access_token", async () => {
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
		// The hint is only a hint (RFC 7009 section 2.2.1): the server
		// searches across all supported token types. Revoking a refresh
		// token succeeds regardless of the hint the client sent.
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);

		// The refresh token must actually be revoked: the refresh grant
		// fails with invalid_grant afterwards.
		if (!oauthClient?.client_id || !oauthClient.client_secret) {
			throw Error("beforeAll not run properly");
		}
		const refreshed = await client.$fetch<Record<string, unknown>>(
			"/oauth2/token",
			{
				method: "POST",
				body: new URLSearchParams({
					grant_type: "refresh_token",
					refresh_token: tokens.data?.refresh_token!,
					client_id: oauthClient.client_id,
					client_secret: oauthClient.client_secret,
				}),
				headers: {
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(refreshed.error?.status).toBe(400);
		expect((refreshed.error as { error?: string })?.error).toBe(
			"invalid_grant",
		);
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
});
