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
		registered = oauthClient,
	) {
		if (!registered?.client_id || !registered?.client_secret) {
			throw Error("beforeAll not run properly");
		}
		const codeVerifier = generateRandomString(32);
		const url = await createAuthorizationURL({
			id: providerId,
			options: {
				clientId: registered?.client_id,
				clientSecret: registered?.client_secret,
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
		registered = oauthClient,
	) {
		if (!registered?.client_id || !registered?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const { body, headers } = await authorizationCodeRequest({
			...overrides,
			redirectURI: redirectUri,
			options: {
				clientId: registered.client_id,
				clientSecret: registered.client_secret,
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
		registered = oauthClient,
	) {
		const { url: authUrl, codeVerifier } = await createAuthUrl(
			overrides,
			registered,
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
			registered,
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

	async function introspect(token: string) {
		return client.oauth2.introspect(
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
	}

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc7009#section-2.1
	 */
	it("should revoke a refresh_token sent with token_type_hint access_token", async () => {
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
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);
		const introspection = await introspect(tokens.data?.refresh_token!);
		expect(introspection.data).toEqual({ active: false });
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

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc7009#section-2.1
	 */
	it("should revoke an opaque access_token sent with token_type_hint refresh_token", async () => {
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
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);
		const introspection = await introspect(tokens.data?.access_token!);
		expect(introspection.data).toEqual({ active: false });
	});

	it("reports unsupported_token_type for a jwt access_token with token_type_hint refresh_token", async () => {
		const tokens = await getTokens(undefined, validResource);
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
		expect(revocation.error).toMatchObject({
			error: "unsupported_token_type",
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/12029
	 * @see https://datatracker.ietf.org/doc/html/rfc7009#section-2.2
	 */
	describe("invalid tokens", () => {
		it.each([undefined, "access_token", "refresh_token"] as const)(
			"should succeed for an unknown token with token_type_hint %s",
			async (token_type_hint) => {
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
				expect(revocation.data).toBe(null);
				expect(revocation.error).toBe(null);
			},
		);

		it("should succeed when revoking the same refresh_token twice", async () => {
			const tokens = await getTokens();
			for (let i = 0; i < 2; i++) {
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
			}
		});

		it("should not tear down the caller's tokens for another client's revoked refresh_token", async () => {
			const otherClient = await auth.api.adminCreateOAuthClient({
				headers,
				body: {
					redirect_uris: [redirectUri],
					application_type: "native",
					token_endpoint_auth_method: "client_secret_post",
					skip_consent: true,
				},
			});
			const ownerTokens = await getTokens();
			const callerTokens = await getTokens(undefined, undefined, otherClient);
			expect(callerTokens.data?.refresh_token).toBeDefined();

			const revokeAs = (registered: OAuthClient | null, token: string) =>
				client.oauth2.revoke(
					{
						client_id: registered?.client_id,
						client_secret: registered?.client_secret,
						token,
						token_type_hint: "refresh_token",
					},
					{
						headers: {
							accept: "application/json",
							"content-type": "application/x-www-form-urlencoded",
						},
					},
				);
			expect(
				(await revokeAs(oauthClient, ownerTokens.data?.refresh_token!)).error,
			).toBe(null);

			const revocation = await revokeAs(
				otherClient,
				ownerTokens.data?.refresh_token!,
			);
			expect(revocation.data).toBe(null);
			expect(revocation.error).toBe(null);

			const introspection = await client.oauth2.introspect(
				{
					client_id: otherClient?.client_id,
					client_secret: otherClient?.client_secret,
					token: callerTokens.data?.refresh_token!,
					token_type_hint: "refresh_token",
				},
				{
					headers: {
						accept: "application/json",
						"content-type": "application/x-www-form-urlencoded",
					},
				},
			);
			expect(introspection.data?.active).toBe(true);
		});
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

	describe("formatRefreshToken decrypt throws on foreign input", async () => {
		const encryptedPrefix = "enc.";
		const testScopes = ["openid", "offline_access"];
		const { client, oauthClient } = await createTestInstance({
			oauthProviderConfig: {
				scopes: testScopes,
				formatRefreshToken: {
					encrypt: (token) => `${encryptedPrefix}${token}`,
					decrypt: (token) => {
						if (!token.startsWith(encryptedPrefix)) {
							throw new Error("cannot decrypt refresh token");
						}
						return { token: token.slice(encryptedPrefix.length) };
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

		type TokenTypeHint = "access_token" | "refresh_token";

		function revoke(token: string, token_type_hint?: TokenTypeHint) {
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

		function introspect(token: string, token_type_hint?: TokenTypeHint) {
			return client.oauth2.introspect(
				{
					client_id: oauthClient?.client_id,
					client_secret: oauthClient?.client_secret,
					token,
					token_type_hint,
				},
				{ headers: formHeaders },
			);
		}

		it.each([undefined, "access_token", "refresh_token"] as const)(
			"should succeed for an unknown token with token_type_hint %s",
			async (token_type_hint) => {
				const revocation = await revoke("bogus", token_type_hint);
				expect(revocation.data).toBe(null);
				expect(revocation.error).toBe(null);
			},
		);

		it("should revoke an opaque access_token sent with token_type_hint refresh_token", async () => {
			const tokens = await getTokens();
			expect(tokens.access_token).toBeDefined();
			const revocation = await revoke(tokens.access_token!, "refresh_token");
			expect(revocation.data).toBe(null);
			expect(revocation.error).toBe(null);
			const introspection = await introspect(
				tokens.access_token!,
				"access_token",
			);
			expect(introspection.data).toEqual({ active: false });
		});

		it("should still revoke a valid refresh_token", async () => {
			const tokens = await getTokens();
			expect(tokens.refresh_token?.startsWith(encryptedPrefix)).toBeTruthy();
			const revocation = await revoke(tokens.refresh_token!, "refresh_token");
			expect(revocation.data).toBe(null);
			expect(revocation.error).toBe(null);
			const introspection = await introspect(tokens.refresh_token!);
			expect(introspection.data).toEqual({ active: false });
		});
	});
});
