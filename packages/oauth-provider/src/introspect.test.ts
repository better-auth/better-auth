import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import {
	createAuthorizationCodeRequest,
	createAuthorizationURL,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthOptions, Scope } from "./types";
import type { OAuthClient } from "./types/oauth";

type MakeRequired<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

describe("oauth introspect", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const validAudience = "https://myapi.example.com";
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
				validAudiences: [validAudience],
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

	let oauthClient: OAuthClient | null;

	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;
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
			Partial<Parameters<typeof createAuthorizationCodeRequest>[0]>,
			"code"
		>,
	) {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const { body, headers } = createAuthorizationCodeRequest({
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
		authCodeOverrides?: Partial<
			Parameters<typeof createAuthorizationCodeRequest>[0]
		>,
		authorizeHeaders?: Headers,
	) {
		const { url: authUrl, codeVerifier } = await createAuthUrl(overrides);
		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			headers: authorizeHeaders ?? headers,
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		const url = new URL(callbackRedirectUrl);
		return await validateAuthCode({
			...authCodeOverrides,
			code: url.searchParams.get("code")!,
			codeVerifier,
		});
	}

	// Registers a confidential client application to work with
	beforeAll(async () => {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				scope: "openid profile email offline_access",
				skip_consent: true,
			},
		});
		expect(response?.client_id).toBeDefined();
		expect(response?.user_id).toBeDefined();
		expect(response?.client_secret).toBeDefined();
		expect(response?.redirect_uris).toEqual([redirectUri]);
		oauthClient = response;
	});

	it("should fail unauthenticated request - no client_id or client_secret", async () => {
		const tokens = await getTokens();
		const introspection = await client.oauth2.introspect(
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
		expect(introspection.error?.status).toBe(401);
	});

	it("should pass with token_type_hint access_token and sent jwt access_token", async () => {
		const tokens = await getTokens(undefined, {
			resource: validAudience,
		});
		const introspection = await client.oauth2.introspect(
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
		expect(introspection.data).toMatchObject({
			active: true,
			client_id: oauthClient?.client_id,
			scope: "openid profile email offline_access",
			sub: expect.any(String),
			iss: authServerBaseUrl,
			exp: expect.any(Number),
			iat: expect.any(Number),
			sid: expect.any(String),
		});
	});

	it("should pass with token_type_hint access_token and sent opaque access_token", async () => {
		const tokens = await getTokens();
		const introspection = await client.oauth2.introspect(
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
		expect(introspection.data).toMatchObject({
			active: true,
			client_id: oauthClient?.client_id,
			scope: "openid profile email offline_access",
			sub: expect.any(String),
			iss: authServerBaseUrl,
			exp: expect.any(Number),
			iat: expect.any(Number),
			sid: expect.any(String),
		});
	});

	it("should fail with token_type_hint access_token and sent refresh_token", async () => {
		const tokens = await getTokens();
		const introspection = await client.oauth2.introspect(
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
		expect(introspection.data?.active).toBeFalsy();
	});

	it("should pass with token_type_hint refresh_token and sent refresh_token", async () => {
		const tokens = await getTokens();
		const introspection = await client.oauth2.introspect(
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
		expect(introspection.data).toMatchObject({
			active: true,
			client_id: oauthClient?.client_id,
			scope: "openid profile email offline_access",
			sub: expect.any(String),
			iss: authServerBaseUrl,
			exp: expect.any(Number),
			iat: expect.any(Number),
			sid: expect.any(String),
		});
	});

	it("should fail with token_type_hint refresh_token and sent access_token", async () => {
		const tokens = await getTokens();
		const introspection = await client.oauth2.introspect(
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
		expect(introspection.data?.active).toBeFalsy();
	});

	it("should pass without token_type_hint and sent jwt access_token", async () => {
		const tokens = await getTokens(undefined, {
			resource: validAudience,
		});
		const introspection = await client.oauth2.introspect(
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
		expect(introspection.data).toMatchObject({
			active: true,
			client_id: oauthClient?.client_id,
			scope: "openid profile email offline_access",
			sub: expect.any(String),
			iss: authServerBaseUrl,
			exp: expect.any(Number),
			iat: expect.any(Number),
			sid: expect.any(String),
		});
	});

	it("should read the signing keys once across repeated jwt introspections", async () => {
		const tokens = await getTokens(undefined, {
			resource: validAudience,
		});
		const ctx = await auth.$context;
		const findMany = vi.spyOn(ctx.adapter, "findMany");
		// Shift only Date past the JWKS cache TTL so any entry cached by earlier
		// introspections is stale and exactly one fresh read is expected.
		vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 6 * 60 * 1000 });
		try {
			for (let i = 0; i < 2; i++) {
				const introspection = await client.oauth2.introspect(
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
				expect(introspection.data).toMatchObject({ active: true });
			}
			const jwksReads = findMany.mock.calls.filter(
				([args]) => args.model === "jwks",
			);
			expect(jwksReads).toHaveLength(1);
		} finally {
			vi.useRealTimers();
			findMany.mockRestore();
		}
	});

	it("should pass without token_type_hint and sent opaque access_token", async () => {
		const tokens = await getTokens();
		const introspection = await client.oauth2.introspect(
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
		expect(introspection.data).toMatchObject({
			active: true,
			client_id: oauthClient?.client_id,
			scope: "openid profile email offline_access",
			sub: expect.any(String),
			iss: authServerBaseUrl,
			exp: expect.any(Number),
			iat: expect.any(Number),
			sid: expect.any(String),
		});
	});

	it("should pass without token_type_hint and sent refresh_token", async () => {
		const tokens = await getTokens();
		const introspection = await client.oauth2.introspect(
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
		expect(introspection.data).toMatchObject({
			active: true,
			client_id: oauthClient?.client_id,
			scope: "openid profile email offline_access",
			sub: expect.any(String),
			iss: authServerBaseUrl,
			exp: expect.any(Number),
			iat: expect.any(Number),
			sid: expect.any(String),
		});
	});

	it("should pass opaque access_token introspection with logged out user", async () => {
		const { headers: testHeaders } = await signInWithTestUser();
		const tokens = await getTokens(undefined, undefined, testHeaders);
		const signOut = await auth.api.signOut({
			headers: testHeaders,
		});
		expect(signOut.success).toBe(true);

		const introspection = await client.oauth2.introspect(
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
		expect(introspection.data).toMatchObject({
			active: true,
			client_id: oauthClient?.client_id,
			scope: "openid profile email offline_access",
			sub: expect.any(String),
			iss: authServerBaseUrl,
			exp: expect.any(Number),
			iat: expect.any(Number),
		});
		expect(introspection.data?.sid).toBeUndefined();
	});

	it("should pass jwt access_token introspection with logged out user", async () => {
		const { headers: testHeaders } = await signInWithTestUser();
		const tokens = await getTokens(
			undefined,
			{
				resource: validAudience,
			},
			testHeaders,
		);
		const signOut = await auth.api.signOut({
			headers: testHeaders,
		});
		expect(signOut.success).toBe(true);

		const introspection = await client.oauth2.introspect(
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
		expect(introspection.data).toMatchObject({
			active: true,
			client_id: oauthClient?.client_id,
			scope: "openid profile email offline_access",
			sub: expect.any(String),
			iss: authServerBaseUrl,
			exp: expect.any(Number),
			iat: expect.any(Number),
		});
		expect(introspection.data?.sid).toBeUndefined();
	});

	it("should pass refresh_token introspection with logged out user", async () => {
		const { headers: testHeaders } = await signInWithTestUser();
		const tokens = await getTokens(undefined, undefined, testHeaders);
		const signOut = await auth.api.signOut({
			headers: testHeaders,
		});
		expect(signOut.success).toBe(true);

		const introspection = await client.oauth2.introspect(
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
		expect(introspection.data).toMatchObject({
			active: true,
			client_id: oauthClient?.client_id,
			scope: "openid profile email offline_access",
			sub: expect.any(String),
			iss: authServerBaseUrl,
			exp: expect.any(Number),
			iat: expect.any(Number),
		});
		expect(introspection.data?.sid).toBeUndefined();
	});
});

describe("oauth introspect - config", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const validAudience = "https://myapi.example.com";
	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;
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
		const { auth, customFetchImpl, signInWithTestUser } = await getTestInstance(
			{
				baseURL: authServerBaseUrl,
				plugins: [
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						validAudiences: [validAudience],
						scopes,
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
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
				redirect_uris: [redirectUri],
				skip_consent: true,
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

		const introspection = await client.oauth2.introspect(
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
		expect(introspection.data).toMatchObject({
			active: true,
			client_id: oauthClient?.client_id,
			scope: testScopes.join(" "),
			iss: authServerBaseUrl,
			exp: expect.any(Number),
			iat: expect.any(Number),
		});
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

		const introspection = await client.oauth2.introspect(
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
		expect(introspection.data).toMatchObject({
			active: true,
			client_id: oauthClient?.client_id,
			scope: testScopes.join(" "),
			iss: authServerBaseUrl,
			sub: expect.any(String),
			exp: expect.any(Number),
			iat: expect.any(Number),
		});
	});
});

describe("oauth introspect - rejects non-OAuth same-issuer JWTs", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;

	// The JWT plugin shares issuer, audience, and signing keys with the OAuth
	// provider. We deliberately make the auth-server origin a valid OAuth
	// audience so a plain session JWT satisfies the signature/issuer/audience
	// checks — isolating the `azp` gate as the only thing that should reject it.
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt({
				jwt: {
					issuer: authServerBaseUrl,
					audience: authServerBaseUrl,
				},
			}),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				validAudiences: [authServerBaseUrl],
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

	let oauthClient: OAuthClient | null = null;

	beforeAll(async () => {
		oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				scope: "openid profile email offline_access",
				skip_consent: true,
			},
		});
		expect(oauthClient?.client_id).toBeDefined();
	});

	async function getOAuthJwtAccessToken() {
		const codeVerifier = generateRandomString(32);
		const authUrl = await createAuthorizationURL({
			id: providerId,
			options: {
				clientId: oauthClient!.client_id!,
				clientSecret: oauthClient!.client_secret!,
				redirectURI: redirectUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
			state: "123",
			scopes: ["openid", "profile", "email", "offline_access"],
			codeVerifier,
		});
		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			headers,
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		const code = new URL(callbackRedirectUrl).searchParams.get("code")!;
		const { body, headers: tokenHeaders } = createAuthorizationCodeRequest({
			code,
			codeVerifier,
			redirectURI: redirectUri,
			// resource makes this a JWT access token with aud = authServerBaseUrl
			resource: authServerBaseUrl,
			options: {
				clientId: oauthClient!.client_id!,
				clientSecret: oauthClient!.client_secret!,
				redirectURI: redirectUri,
			},
		});
		const tokens = await client.$fetch<{ access_token?: string }>(
			"/oauth2/token",
			{ method: "POST", body, headers: tokenHeaders },
		);
		return tokens.data?.access_token!;
	}

	function introspect(token: string) {
		return client.oauth2.introspect(
			{
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token,
				token_type_hint: "access_token",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
	}

	// Positive control: a real OAuth JWT access token (with azp + matching aud)
	// is active in this exact config, proving the iss/aud checks pass here — so
	// the session-token rejection below can only be due to the missing azp.
	it("treats a real OAuth JWT access token as active", async () => {
		const accessToken = await getOAuthJwtAccessToken();
		const introspection = await introspect(accessToken);
		expect(introspection.data?.active).toBe(true);
		expect(introspection.data?.client_id).toBe(oauthClient?.client_id);
	});

	/**
	 * A JWT-plugin session token shares the issuer, audience, and signing keys
	 * but has no `azp`/client binding and was never issued through the OAuth
	 * token endpoint. It must not introspect as an active access token.
	 */
	it("rejects a JWT plugin session token presented as an access token", async () => {
		const { token: sessionJwt } = await auth.api.getToken({ headers });
		// Sanity: it is a real, signed JWS (three segments).
		expect(sessionJwt.split(".")).toHaveLength(3);
		const introspection = await introspect(sessionJwt);
		expect(introspection.data?.active).toBe(false);
	});
});
