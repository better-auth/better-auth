import { beforeAll, describe, it, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { jwt } from "../jwt";
import { oauthProvider } from "./oauth";
import type { OAuthOptions } from "./types";
import { createAuthClient } from "../../client";
import type { OAuthClient } from "../../oauth-2.1/types";
import { oauthProviderClient } from "./client";
import {
	createAuthorizationCodeRequest,
	createAuthorizationURL,
} from "../../oauth2";
import { generateRandomString } from "../../crypto";
import type { MakeRequired } from "../../types/helper";

describe("oauth revoke", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const validAudience = "https://myapi.example.com";
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt({
				jwt: {
					audience: validAudience,
					issuer: authServerBaseUrl,
				},
			}),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
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
		const response = await auth.api.registerOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
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
		const revocation = await client.oauth2.revoke({
			token: tokens.data?.access_token!,
		});
		expect(revocation.error?.status).toBe(401);
	});

	it("should pass verification with token_type_hint access_token and sent jwt access_token", async () => {
		const tokens = await getTokens(undefined, validAudience);
		const revocation = await client.oauth2.revoke({
			client_id: oauthClient?.client_id,
			client_secret: oauthClient?.client_secret,
			token: tokens.data?.access_token!,
			token_type_hint: "access_token",
		});
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);
	});

	it("should pass verification with token_type_hint access_token and sent opaque access_token", async () => {
		const tokens = await getTokens();
		const revocation = await client.oauth2.revoke({
			client_id: oauthClient?.client_id,
			client_secret: oauthClient?.client_secret,
			token: tokens.data?.access_token!,
			token_type_hint: "access_token",
		});
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);
	});

	it("should fail with token_type_hint access_token and sent refresh_token", async () => {
		const tokens = await getTokens();
		const revocation = await client.oauth2.revoke({
			client_id: oauthClient?.client_id,
			client_secret: oauthClient?.client_secret,
			token: tokens.data?.refresh_token!,
			token_type_hint: "access_token",
		});
		expect(revocation.error?.status).toBe(400);
	});

	it("should pass verification with token_type_hint refresh_token and sent refresh_token", async () => {
		const tokens = await getTokens();
		const revocation = await client.oauth2.revoke({
			client_id: oauthClient?.client_id,
			client_secret: oauthClient?.client_secret,
			token: tokens.data?.refresh_token!,
			token_type_hint: "refresh_token",
		});
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);
	});

	it("should fail verification with token_type_hint refresh_token and sent access_token", async () => {
		const tokens = await getTokens();
		const revocation = await client.oauth2.revoke({
			client_id: oauthClient?.client_id,
			client_secret: oauthClient?.client_secret,
			token: tokens.data?.access_token!,
			token_type_hint: "refresh_token",
		});
		expect(revocation.error?.status).toBe(400);
	});

	it("should pass verification without token_type_hint and sent jwt access_token", async () => {
		const tokens = await getTokens(undefined, validAudience);
		const revocation = await client.oauth2.revoke({
			client_id: oauthClient?.client_id,
			client_secret: oauthClient?.client_secret,
			token: tokens.data?.access_token!,
		});
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);
	});

	it("should pass verification without token_type_hint and sent opaque access_token", async () => {
		const tokens = await getTokens();
		const revocation = await client.oauth2.revoke({
			client_id: oauthClient?.client_id,
			client_secret: oauthClient?.client_secret,
			token: tokens.data?.access_token!,
		});
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);
	});

	it("should pass verification without token_type_hint and sent refresh_token", async () => {
		const tokens = await getTokens();
		const revocation = await client.oauth2.revoke({
			client_id: oauthClient?.client_id,
			client_secret: oauthClient?.client_secret,
			token: tokens.data?.refresh_token!,
		});
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);
	});
});

describe("oauth revoke - config", async () => {
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
		oauthProviderConfig?: Omit<OAuthOptions, "loginPage" | "consentPage">;
	}) {
		const { auth, customFetchImpl, signInWithTestUser } = await getTestInstance(
			{
				baseURL: authServerBaseUrl,
				plugins: [
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
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
										audience: validAudience,
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

		const registeredClient = await auth.api.registerOAuthClient({
			headers,
			body: {
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
				opaqueAccessTokenPrefix: prefix,
				scopes: testScopes,
			},
		});
		const tokens = await client.oauth2.token({
			grant_type: "client_credentials",
			client_id: oauthClient?.client_id,
			client_secret: oauthClient?.client_secret,
			scope: testScopes.join(" "),
			redirect_uri: redirectUri,
		});
		expect(tokens.data?.access_token?.startsWith(prefix)).toBeTruthy();

		const revocation = await client.oauth2.revoke({
			client_id: oauthClient?.client_id,
			client_secret: oauthClient?.client_secret,
			token: tokens.data?.access_token ?? "",
			token_type_hint: "access_token",
		});
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);
	});

	it("should pass with the correct refreshTokenPrefix", async () => {
		const refreshTokenPrefix = "hello_rt_";
		const testScopes = ["openid", "offline_access"];
		const { client, oauthClient } = await createTestInstance({
			oauthProviderConfig: {
				refreshTokenPrefix: refreshTokenPrefix,
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
		const tokens = await client.oauth2.token({
			grant_type: "authorization_code",
			code: url.searchParams.get("code") ?? undefined,
			code_verifier: codeVerifier,
			client_id: oauthClient?.client_id,
			client_secret: oauthClient?.client_secret,
			scope: testScopes.join(" "),
			redirect_uri: redirectUri,
		});
		if ("refresh_token" in (tokens.data ?? {})) {
			expect(
				(tokens.data as { refresh_token?: string }).refresh_token?.startsWith(
					refreshTokenPrefix,
				),
			).toBeTruthy();
		} else {
			expect.unreachable();
		}

		const revocation = await client.oauth2.revoke({
			client_id: oauthClient?.client_id,
			client_secret: oauthClient?.client_secret,
			// @ts-expect-error refresh token sent
			token: tokens.data?.refresh_token,
			token_type_hint: "refresh_token",
		});
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);
	});
});
