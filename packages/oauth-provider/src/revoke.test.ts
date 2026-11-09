import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { CompactEncrypt, compactDecrypt } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
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

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc7009#section-2.1
	 * @see https://datatracker.ietf.org/doc/html/rfc7009#section-2.2
	 */
	describe("RFC 7009 token handling", () => {
		function revoke(
			token: string,
			token_type_hint?: string,
			caller: Pick<
				OAuthClient,
				"client_id" | "client_secret"
			> | null = oauthClient,
		) {
			return client.oauth2.revoke(
				{
					client_id: caller?.client_id,
					...(caller?.client_secret
						? { client_secret: caller.client_secret }
						: {}),
					token,
					token_type_hint,
				},
				{
					headers: {
						accept: "application/json",
						"content-type": "application/x-www-form-urlencoded",
					},
				},
			);
		}

		async function isActive(token: string) {
			const introspection = await client.oauth2.introspect(
				{
					client_id: oauthClient?.client_id,
					client_secret: oauthClient?.client_secret,
					token,
				},
				{
					headers: {
						accept: "application/json",
						"content-type": "application/x-www-form-urlencoded",
					},
				},
			);
			return introspection.data?.active;
		}

		it("revokes a refresh_token sent with token_type_hint access_token", async () => {
			const tokens = await getTokens();
			const refreshToken = tokens.data?.refresh_token!;
			expect(await isActive(refreshToken)).toBe(true);

			const revocation = await revoke(refreshToken, "access_token");
			expect(revocation.error).toBe(null);
			expect(await isActive(refreshToken)).toBe(false);
		});

		it("revokes an opaque access_token sent with token_type_hint refresh_token", async () => {
			const tokens = await getTokens();
			const accessToken = tokens.data?.access_token!;
			expect(await isActive(accessToken)).toBe(true);

			const revocation = await revoke(accessToken, "refresh_token");
			expect(revocation.error).toBe(null);
			expect(await isActive(accessToken)).toBe(false);
		});

		it.each([undefined, "access_token", "refresh_token"])(
			"returns 200 for an unknown token (token_type_hint %s)",
			async (hint) => {
				const revocation = await revoke("unknown-token", hint);
				expect(revocation.error).toBe(null);
			},
		);

		function createOtherClient(
			token_endpoint_auth_method: "client_secret_post" | "none",
		) {
			return auth.api.adminCreateOAuthClient({
				headers,
				body: {
					redirect_uris: [redirectUri],
					application_type: "native",
					token_endpoint_auth_method,
					skip_consent: true,
				},
			});
		}

		it.each(["access_token", "refresh_token"] as const)(
			"refuses a confidential client revoking another client's %s",
			async (type) => {
				const tokens = await getTokens();
				const token = tokens.data?.[type]!;
				const other = await createOtherClient("client_secret_post");

				const revocation = await revoke(token, undefined, other);
				expect(revocation.error).toMatchObject({
					status: 400,
					error: "invalid_request",
				});
				expect(await isActive(token)).toBe(true);
			},
		);

		it.each(["access_token", "refresh_token"] as const)(
			"answers a public client revoking another client's %s with 200 and keeps the token",
			async (type) => {
				const tokens = await getTokens();
				const token = tokens.data?.[type]!;
				const other = await createOtherClient("none");

				const revocation = await revoke(token, undefined, {
					client_id: other.client_id,
				});
				expect(revocation.error).toBe(null);
				expect(await isActive(token)).toBe(true);
			},
		);

		it("applies the same ownership rule to another client's JWT access_token", async () => {
			const tokens = await getTokens(undefined, validResource);
			const jwtAccessToken = tokens.data?.access_token!;
			expect(jwtAccessToken.split(".")).toHaveLength(3);

			const confidential = await createOtherClient("client_secret_post");
			expect(
				(await revoke(jwtAccessToken, undefined, confidential)).error,
			).toMatchObject({ status: 400, error: "invalid_request" });

			const publicClient = await createOtherClient("none");
			expect(
				(
					await revoke(jwtAccessToken, undefined, {
						client_id: publicClient.client_id,
					})
				).error,
			).toBe(null);
		});

		it("refuses another client's revoked refresh_token before replay handling", async () => {
			const tokens = await getTokens();
			const refreshToken = tokens.data?.refresh_token!;
			expect((await revoke(refreshToken)).error).toBe(null);

			const other = await createOtherClient("client_secret_post");
			const revocation = await revoke(refreshToken, undefined, other);
			expect(revocation.error).toMatchObject({
				status: 400,
				error: "invalid_request",
			});
		});

		/**
		 * @see https://github.com/better-auth/better-auth/issues/11595
		 */
		it("returns 200 for a JWT-shaped token that fails verification", async () => {
			const revocation = await revoke("eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.");
			expect(revocation.error).toBe(null);
		});

		it("returns 200 when revoking an already revoked refresh_token", async () => {
			const tokens = await getTokens();
			const refreshToken = tokens.data?.refresh_token!;
			expect((await revoke(refreshToken, "refresh_token")).error).toBe(null);
			expect((await revoke(refreshToken, "refresh_token")).error).toBe(null);
			expect(await isActive(refreshToken)).toBe(false);
		});
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

	/**
	 * The JWE refresh-token format from the `formatRefreshToken` docs, on a
	 * deployment without the JWT plugin.
	 * @see https://datatracker.ietf.org/doc/html/rfc7009#section-2.1
	 */
	describe("encrypted refresh tokens without the JWT plugin", () => {
		const key = new Uint8Array(32).fill(7);
		const formatRefreshToken = {
			encrypt: async (token: string, sessionId?: string) =>
				new CompactEncrypt(
					new TextEncoder().encode(JSON.stringify({ token, sessionId })),
				)
					.setProtectedHeader({ alg: "A256KW", enc: "A256GCM" })
					.encrypt(key),
			decrypt: async (token: string) => {
				const { plaintext } = await compactDecrypt(token, key);
				return JSON.parse(new TextDecoder().decode(plaintext));
			},
		};

		async function setup() {
			const testScopes = ["openid", "offline_access"];
			const { client, oauthClient } = await createTestInstance({
				oauthProviderConfig: {
					disableJwtPlugin: true,
					formatRefreshToken,
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
			const tokens = await client.$fetch<{
				access_token: string;
				refresh_token: string;
			}>("/oauth2/token", {
				method: "POST",
				body: new URLSearchParams({
					grant_type: "authorization_code",
					code: new URL(callbackRedirectUrl).searchParams.get("code")!,
					code_verifier: codeVerifier,
					client_id: oauthClient.client_id,
					client_secret: oauthClient.client_secret!,
					redirect_uri: redirectUri,
				}),
				headers: { "content-type": "application/x-www-form-urlencoded" },
			});
			const call = (path: string, body: Record<string, string>) =>
				client.$fetch<{ active?: boolean }>(path, {
					method: "POST",
					body: new URLSearchParams({
						client_id: oauthClient.client_id,
						client_secret: oauthClient.client_secret!,
						...body,
					}),
					headers: { "content-type": "application/x-www-form-urlencoded" },
				});
			return { tokens: tokens.data!, call };
		}

		it("revokes the encrypted refresh_token", async () => {
			const { tokens, call } = await setup();
			expect(tokens.refresh_token.split(".")).toHaveLength(5);
			const revoked = await call("/oauth2/revoke", {
				token: tokens.refresh_token,
			});
			expect(revoked.error).toBe(null);
			const introspection = await call("/oauth2/introspect", {
				token: tokens.refresh_token,
			});
			expect(introspection.data?.active).toBe(false);
		});

		it("revokes an opaque access_token sent with token_type_hint refresh_token", async () => {
			const { tokens, call } = await setup();
			const revoked = await call("/oauth2/revoke", {
				token: tokens.access_token,
				token_type_hint: "refresh_token",
			});
			expect(revoked.error).toBe(null);
			const introspection = await call("/oauth2/introspect", {
				token: tokens.access_token,
			});
			expect(introspection.data?.active).toBe(false);
		});

		it("returns 200 for an unknown token the decoder rejects", async () => {
			const { call } = await setup();
			const revoked = await call("/oauth2/revoke", {
				token: "not-a-jwe",
				token_type_hint: "refresh_token",
			});
			expect(revoked.error).toBe(null);
		});
	});

	/**
	 * An expired JWT access token cannot be a refresh token, so the lookup must
	 * stop before a `formatRefreshToken.decrypt` that throws on unknown input.
	 * @see https://datatracker.ietf.org/doc/html/rfc7009#section-2.2
	 */
	it("returns 200 for an expired JWT access_token without token_type_hint", async () => {
		const testScopes = ["read:profile"];
		const { client, oauthClient } = await createTestInstance({
			oauthProviderConfig: {
				scopes: testScopes,
				formatRefreshToken: {
					encrypt: (token) => `rt.${token}`,
					decrypt: (token) => {
						if (!token.startsWith("rt.")) {
							throw new Error("not a refresh token");
						}
						return { token: token.slice(3) };
					},
				},
			},
		});
		const headers = {
			accept: "application/json",
			"content-type": "application/x-www-form-urlencoded",
		};
		const tokens = await client.oauth2.token(
			{
				grant_type: "client_credentials",
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				scope: testScopes.join(" "),
				resource: validResource,
			},
			{ headers },
		);
		const accessToken = tokens.data?.access_token!;
		expect(accessToken.split(".")).toHaveLength(3);

		vi.useFakeTimers({
			toFake: ["Date"],
			now: Date.now() + 2 * 60 * 60 * 1000,
		});
		try {
			const revocation = await client.oauth2.revoke(
				{
					client_id: oauthClient?.client_id,
					client_secret: oauthClient?.client_secret,
					token: accessToken,
				},
				{ headers },
			);
			expect(revocation.error).toBe(null);
		} finally {
			vi.useRealTimers();
		}
	});

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
