import { beforeAll, describe, it, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { oauthProvider } from "./oauth";
import type { OAuthOptions } from "./types";
import type { OAuthClient } from "../../oauth-2.1/types";
import { createAuthClient } from "../../client";
import { oauthProviderClient } from "./client";
import { jwt } from "../jwt";
import {
	createAuthorizationCodeRequest,
	createAuthorizationURL,
	createRefreshAccessTokenRequest,
} from "../../oauth2";
import type { ProviderOptions } from "../../oauth2";
import { generateRandomString } from "../../crypto";
import type { MakeRequired } from "../../types/helper";
import { createLocalJWKSet, decodeJwt, jwtVerify } from "jose";
import { createClientCredentialsTokenRequest } from "@better-auth/core/oauth2";
import { jwtClient } from "../jwt/client";

describe("oauth token - authorization_code", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const validAudience = "https://myapi.example.com";
	const { auth, signInWithTestUser, customFetchImpl, testUser } =
		await getTestInstance({
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
					consentPage: "/oauth2/authorize",
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
				}),
			],
		});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient(), jwtClient()],
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
	let jwks: ReturnType<typeof createLocalJWKSet>;

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

		// Get jwks
		const jwksResult = await client.jwks();
		if (!jwksResult.data) {
			throw new Error("Unable to fetch jwks");
		}
		jwks = createLocalJWKSet(jwksResult.data);
	});

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

	it("scope openid should provide access_token and id_token", async ({
		expect,
	}) => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const scopes = ["openid"];
		const { url: authUrl, codeVerifier } = await createAuthUrl({
			scopes,
		});

		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackRedirectUrl).toContain(redirectUri);
		expect(callbackRedirectUrl).toContain(`code=`);
		expect(callbackRedirectUrl).toContain(`state=123`);
		const url = new URL(callbackRedirectUrl);

		const tokens = await validateAuthCode({
			code: url.searchParams.get("code")!,
			codeVerifier,
		});
		expect(tokens.data?.access_token).toBeDefined(); // Note: Opaque
		expect(tokens.data?.id_token).toBeDefined();
		expect(tokens.data?.refresh_token).toBeUndefined();
		expect(tokens.data?.scope).toBe(scopes.join(" "));

		const idToken = await jwtVerify(tokens.data?.id_token!, jwks);
		expect(idToken.protectedHeader).toBeDefined();
		expect(idToken.payload).toBeDefined();
		expect(idToken.payload.sub).toBeDefined();
		expect(idToken.payload.name).toBeUndefined();
		expect(idToken.payload.email).toBeUndefined();
	});

	it("scope openid+profile should provide access_token and id_token", async ({
		expect,
	}) => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const scopes = ["openid", "profile"];
		const { url: authUrl, codeVerifier } = await createAuthUrl({
			scopes,
		});

		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackRedirectUrl).toContain(redirectUri);
		expect(callbackRedirectUrl).toContain(`code=`);
		expect(callbackRedirectUrl).toContain(`state=123`);
		const url = new URL(callbackRedirectUrl);

		const tokens = await validateAuthCode({
			code: url.searchParams.get("code")!,
			codeVerifier,
		});
		expect(tokens.data?.access_token).toBeDefined();
		expect(tokens.data?.id_token).toBeDefined();
		expect(tokens.data?.refresh_token).toBeUndefined();
		expect(tokens.data?.scope).toBe(scopes.join(" "));

		const idToken = await jwtVerify(tokens.data?.id_token!, jwks);
		expect(idToken.protectedHeader).toBeDefined();
		expect(idToken.payload).toBeDefined();
		expect(idToken.payload.sub).toBeDefined();
		expect(idToken.payload.name).toBe(testUser.name);
		expect(idToken.payload.email).toBeUndefined();
	});

	it("scope openid+email should provide access_token and id_token", async ({
		expect,
	}) => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const scopes = ["openid", "email"];
		const { url: authUrl, codeVerifier } = await createAuthUrl({
			scopes,
		});

		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackRedirectUrl).toContain(redirectUri);
		expect(callbackRedirectUrl).toContain(`code=`);
		expect(callbackRedirectUrl).toContain(`state=123`);
		const url = new URL(callbackRedirectUrl);

		const tokens = await validateAuthCode({
			code: url.searchParams.get("code")!,
			codeVerifier,
		});
		expect(tokens.data?.access_token).toBeDefined();
		expect(tokens.data?.id_token).toBeDefined();
		expect(tokens.data?.refresh_token).toBeUndefined();
		expect(tokens.data?.scope).toBe(scopes.join(" "));

		const idToken = await jwtVerify(tokens.data?.id_token!, jwks);
		expect(idToken.protectedHeader).toBeDefined();
		expect(idToken.payload).toBeDefined();
		expect(idToken.payload.sub).toBeDefined();
		expect(idToken.payload.name).toBeUndefined();
		expect(idToken.payload.email).toBe(testUser.email);
	});

	it("scope openid+offline_access should provide opaque access_token, id_token, and refresh_token", async ({
		expect,
	}) => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const scopes = ["openid", "offline_access"];
		const { url: authUrl, codeVerifier } = await createAuthUrl({
			scopes,
		});

		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackRedirectUrl).toContain(redirectUri);
		expect(callbackRedirectUrl).toContain(`code=`);
		expect(callbackRedirectUrl).toContain(`state=123`);
		const url = new URL(callbackRedirectUrl);

		const tokens = await validateAuthCode({
			code: url.searchParams.get("code")!,
			codeVerifier,
		});
		expect(tokens.data?.access_token).toBeDefined();
		expect(tokens.data?.id_token).toBeDefined();
		expect(tokens.data?.refresh_token).toBeDefined();
		expect(tokens.data?.scope).toBe(scopes.join(" "));

		const idToken = await jwtVerify(tokens.data?.id_token!, jwks);
		expect(idToken.protectedHeader).toBeDefined();
		expect(idToken.payload).toBeDefined();
		expect(idToken.payload.sub).toBeDefined();
		expect(idToken.payload.name).toBeUndefined();
		expect(idToken.payload.email).toBeUndefined();
	});

	it("scope openid+offline_access & specified resource should provide JWT access_token, id_token, and refresh_token", async ({
		expect,
	}) => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const scopes = ["openid", "offline_access"];
		const { url: authUrl, codeVerifier } = await createAuthUrl({
			scopes,
		});

		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackRedirectUrl).toContain(redirectUri);
		expect(callbackRedirectUrl).toContain(`code=`);
		expect(callbackRedirectUrl).toContain(`state=123`);
		const url = new URL(callbackRedirectUrl);

		const tokens = await validateAuthCode({
			code: url.searchParams.get("code")!,
			codeVerifier,
			resource: validAudience,
		});
		expect(tokens.data?.access_token).toBeDefined();
		expect(tokens.data?.id_token).toBeDefined();
		expect(tokens.data?.refresh_token).toBeDefined();
		expect(tokens.data?.scope).toBe(scopes.join(" "));

		const idToken = await jwtVerify(tokens.data?.id_token!, jwks);
		expect(idToken.protectedHeader).toBeDefined();
		expect(idToken.payload).toBeDefined();
		expect(idToken.payload.sub).toBeDefined();
		expect(idToken.payload.name).toBeUndefined();
		expect(idToken.payload.email).toBeUndefined();

		const accessToken = await jwtVerify(tokens.data?.access_token!, jwks, {
			audience: validAudience,
			issuer: authServerBaseUrl,
		});
		expect(accessToken.payload.azp).toBe(oauthClient.client_id);
		expect(accessToken.payload.sub).toBeDefined();
		expect(accessToken.payload.iat).toBeDefined();
		expect(accessToken.payload.exp).toBe(tokens.data?.expires_at);
		expect(accessToken.payload.scope).toBe(scopes.join(" "));
	});
});

describe("oauth token - refresh_token", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const validAudience = "https://myapi.example.com";
	const {
		auth: authorizationServer,
		signInWithTestUser,
		customFetchImpl,
	} = await getTestInstance({
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
				consentPage: "/oauth2/authorize",
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
		],
	});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient(), jwtClient()],
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
	let jwks: ReturnType<typeof createLocalJWKSet>;

	// Registers a confidential client application to work with
	beforeAll(async () => {
		const response = await authorizationServer.api.registerOAuthClient({
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

		// Get jwks
		const jwksResult = await client.jwks();
		if (!jwksResult.data) {
			throw new Error("Unable to fetch jwks");
		}
		jwks = createLocalJWKSet(jwksResult.data);
	});

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

	/** Initial authorization */
	async function authorizeForRefreshToken(scopes: string[]) {
		const { url: authUrl, codeVerifier } = await createAuthUrl({
			scopes,
		});

		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackRedirectUrl).toContain(redirectUri);
		expect(callbackRedirectUrl).toContain(`code=`);
		expect(callbackRedirectUrl).toContain(`state=123`);
		const url = new URL(callbackRedirectUrl);

		const tokens = await validateAuthCode({
			code: url.searchParams.get("code")!,
			codeVerifier,
		});
		expect(tokens.data?.access_token).toBeDefined();
		expect(tokens.data?.id_token).toBeDefined();
		expect(tokens.data?.refresh_token).toBeDefined();
		expect(tokens.data?.scope).toBe(scopes.join(" "));

		const idToken = await jwtVerify(tokens.data?.id_token!, jwks);
		expect(idToken.protectedHeader).toBeDefined();
		expect(idToken.payload).toBeDefined();
		expect(idToken.payload.sub).toBeDefined();
		expect(idToken.payload.name).toBeDefined();
		expect(idToken.payload.email).toBeUndefined();

		return tokens.data;
	}

	it("should refresh token with same scopes, opaque access token", async ({
		expect,
	}) => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const scopes = ["openid", "profile", "offline_access"];
		const tokens = await authorizeForRefreshToken(scopes);
		expect(tokens?.refresh_token).toBeDefined();

		// Refresh tokens
		const { body, headers } = createRefreshAccessTokenRequest({
			refreshToken: tokens?.refresh_token!,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
			},
			extraParams: {
				scope: scopes.join(" "),
			},
		});
		const newTokens = await client.$fetch<{
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
		expect(newTokens.data?.access_token).toBeDefined();
		expect(newTokens.data?.id_token).toBeDefined();
		expect(newTokens.data?.refresh_token).toBeDefined();
		expect(newTokens.data?.scope).toBe(scopes.join(" "));

		// Always expect a new refresh token
		expect(tokens?.refresh_token).not.toEqual(newTokens.data?.refresh_token);
	});

	it("should refresh token with same scopes, JWT access token", async ({
		expect,
	}) => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const scopes = ["openid", "profile", "offline_access"];
		const tokens = await authorizeForRefreshToken(scopes);
		expect(tokens?.refresh_token).toBeDefined();

		// Refresh tokens
		const { body, headers } = createRefreshAccessTokenRequest({
			refreshToken: tokens?.refresh_token!,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
			},
			extraParams: {
				scope: scopes.join(" "),
			},
			resource: validAudience,
		});
		const newTokens = await client.$fetch<{
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
		expect(newTokens.data?.access_token).toBeDefined();
		expect(newTokens.data?.id_token).toBeDefined();
		expect(newTokens.data?.refresh_token).toBeDefined();
		expect(newTokens.data?.scope).toBe(scopes.join(" "));

		// Always expect a new refresh token
		expect(tokens?.refresh_token).not.toEqual(newTokens.data?.refresh_token);

		const accessToken = await jwtVerify(newTokens.data?.access_token!, jwks, {
			audience: validAudience,
			issuer: authServerBaseUrl,
		});
		expect(accessToken.payload.azp).toBe(oauthClient.client_id);
		expect(accessToken.payload.sub).toBeDefined();
		expect(accessToken.payload.iat).toBeDefined();
		expect(accessToken.payload.exp).toBe(newTokens.data?.expires_at);
		expect(accessToken.payload.scope).toBe(scopes.join(" "));
	});

	it("should refresh token with lesser scopes, opaque access token", async ({
		expect,
	}) => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const scopes = ["openid", "profile", "offline_access"];
		const newScopes = ["openid", "offline_access"];
		const tokens = await authorizeForRefreshToken(scopes);
		expect(tokens?.refresh_token).toBeDefined();

		// Refresh tokens
		const { body, headers } = createRefreshAccessTokenRequest({
			refreshToken: tokens?.refresh_token!,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
			},
			extraParams: {
				scope: newScopes.join(" "),
			},
		});
		const newTokens = await client.$fetch<{
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
		expect(newTokens.data?.access_token).toBeDefined();
		expect(newTokens.data?.id_token).toBeDefined();
		expect(newTokens.data?.refresh_token).toBeDefined();
		expect(newTokens.data?.scope).toBe(newScopes.join(" "));

		// Always expect a new refresh token
		expect(tokens?.refresh_token).not.toEqual(newTokens.data?.refresh_token);
	});

	it("should refresh token with lesser scopes, JWT access token", async ({
		expect,
	}) => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const scopes = ["openid", "profile", "offline_access"];
		const newScopes = ["openid", "offline_access"];
		const tokens = await authorizeForRefreshToken(scopes);
		expect(tokens?.refresh_token).toBeDefined();

		// Refresh tokens
		const { body, headers } = createRefreshAccessTokenRequest({
			refreshToken: tokens?.refresh_token!,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
			},
			extraParams: {
				scope: newScopes.join(" "),
			},
			resource: validAudience,
		});
		const newTokens = await client.$fetch<{
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
		expect(newTokens.data?.access_token).toBeDefined();
		expect(newTokens.data?.id_token).toBeDefined();
		expect(newTokens.data?.refresh_token).toBeDefined();
		expect(newTokens.data?.scope).toBe(newScopes.join(" "));

		// Always expect a new refresh token
		expect(tokens?.refresh_token).not.toEqual(newTokens.data?.refresh_token);

		const accessToken = await jwtVerify(newTokens.data?.access_token!, jwks, {
			audience: validAudience,
			issuer: authServerBaseUrl,
		});
		expect(accessToken.payload.azp).toBe(oauthClient.client_id);
		expect(accessToken.payload.sub).toBeDefined();
		expect(accessToken.payload.iat).toBeDefined();
		expect(accessToken.payload.exp).toBe(newTokens.data?.expires_at);
		expect(accessToken.payload.scope).toBe(newScopes.join(" "));
	});

	it("should not refresh token when removing offline_scope", async ({
		expect,
	}) => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const scopes = ["openid", "profile", "offline_access"];
		const newScopes = ["openid"];
		const tokens = await authorizeForRefreshToken(scopes);
		expect(tokens?.refresh_token).toBeDefined();

		// Refresh tokens
		const { body, headers } = createRefreshAccessTokenRequest({
			refreshToken: tokens?.refresh_token!,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
			},
			extraParams: {
				scope: newScopes.join(" "),
			},
		});
		const newTokens = await client.$fetch<{
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
		expect(newTokens.data?.access_token).toBeDefined();
		expect(newTokens.data?.id_token).toBeDefined();
		expect(newTokens.data?.refresh_token).toBeUndefined();
		expect(newTokens.data?.scope).toBe(newScopes.join(" "));

		// Should not refresh token
		expect(tokens?.refresh_token).not.toEqual(newTokens.data?.refresh_token);
	});

	it("should not refresh token with more scopes", async () => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const scopes = ["openid", "profile", "offline_access"];
		const newScopes = ["openid", "email", "offline_access"];
		const tokens = await authorizeForRefreshToken(scopes);
		expect(tokens?.refresh_token).toBeDefined();

		// Refresh tokens
		const { body, headers } = createRefreshAccessTokenRequest({
			refreshToken: tokens?.refresh_token!,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
			},
			extraParams: {
				scope: newScopes.join(" "),
			},
		});
		const newTokens = await client.$fetch<{
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
		expect(newTokens.error?.status).toBeDefined();
	});
});

describe("oauth token - client_credentials", async () => {
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
				consentPage: "/oauth2/authorize",
				allowDynamicClientRegistration: true,
				scopes: ["openid", "profile", "email", "read:posts"],
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
		],
	});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient(), jwtClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: {
			customFetchImpl,
			headers,
		},
	});

	let oauthClient: OAuthClient | null;

	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;
	let jwks: ReturnType<typeof createLocalJWKSet>;

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

		// Get jwks
		const jwksResult = await client.jwks();
		if (!jwksResult.data) {
			throw new Error("Unable to fetch jwks");
		}
		jwks = createLocalJWKSet(jwksResult.data);
	});

	it("should obtain an opaque access token", async () => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const scopes = ["read:posts"];
		const { body, headers } = createClientCredentialsTokenRequest({
			scope: scopes.join(" "),
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
		expect(tokens.data?.access_token).toBeDefined();
		expect(tokens.data?.id_token).toBeUndefined();
		expect(tokens.data?.refresh_token).toBeUndefined();
		expect(tokens.data?.scope).toBe(scopes.join(" "));
		expect(tokens.data?.expires_in).toBe(3600);
		expect(tokens.data?.expires_at).toBeDefined();
	});

	it("should fail without requested scope and clientCredentialGrantDefaultScopes not set", async ({
		expect,
	}) => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const { body, headers } = createClientCredentialsTokenRequest({
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
		expect(tokens.error?.status).toBeDefined();
	});

	it("should obtain a JWT access token", async () => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const scopes = ["read:posts"];
		const { body, headers } = createClientCredentialsTokenRequest({
			scope: scopes.join(" "),
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
			},
			resource: validAudience,
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
		expect(tokens.data?.access_token).toBeDefined();
		expect(tokens.data?.id_token).toBeUndefined();
		expect(tokens.data?.refresh_token).toBeUndefined();
		expect(tokens.data?.scope).toBe(scopes.join(" "));
		expect(tokens.data?.expires_in).toBe(3600);
		expect(tokens.data?.expires_at).toBeDefined();

		const accessToken = await jwtVerify(tokens.data?.access_token!, jwks, {
			audience: validAudience,
			issuer: authServerBaseUrl,
		});
		expect(accessToken.payload.azp).toBe(oauthClient.client_id);
		expect(accessToken.payload.sub).toBeUndefined(); // unset since not a user!
		expect(accessToken.payload.iat).toBeDefined();
		expect(accessToken.payload.exp).toBe(tokens.data?.expires_at);
		expect(accessToken.payload.scope).toBe(scopes.join(" "));
	});
});

describe("oauth token - config", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const validAudience = "https://myapi.example.com";
	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;

	const state = "123";
	const scopes = [
		"openid",
		"email",
		"profile",
		"offline_access",
		"read:payments", // should use scopeExpirations 30m
		"write:payments", // should use scopeExpirations 5m
		"read:profile", // should use default
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
		credentials: ProviderOptions,
		overrides?: Partial<Parameters<typeof createAuthorizationURL>[0]>,
	) {
		const codeVerifier = generateRandomString(32);
		const url = await createAuthorizationURL({
			id: providerId,
			options: credentials,
			redirectURI: redirectUri,
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
			state,
			scopes,
			codeVerifier,
			...overrides,
		});
		return {
			url,
			codeVerifier,
		};
	}

	// Client Credentials Grant
	it.each([
		{
			testScopes: ["read:payments"],
			result: 1800, // 30m lowest
		},
		{
			testScopes: ["read:payments", "write:payments"],
			result: 300, // 5m lowest
		},
		{
			testScopes: ["read:profile"],
			result: 7200, // m2m expiresIn 2hr
		},
	])(
		"scopeExpirations - access token expiration $testScopes",
		async ({ testScopes, result }) => {
			const { client, oauthClient } = await createTestInstance({
				oauthProviderConfig: {
					m2mAccessTokenExpiresIn: 7200,
					scopeExpirations: {
						"read:payments": "30m",
						"write:payments": "5m",
					},
				},
			});
			// Client credentials
			const tokens = await client.oauth2.token({
				resource: validAudience,
				grant_type: "client_credentials",
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				scope: testScopes.join(" "),
			});
			expect(tokens.data?.expires_in).toBe(result); // 5m lowest
			// NOTE: verification is done in other tests (we only care about the exp fields in this test)
			const accessToken = decodeJwt(tokens.data?.access_token ?? "");
			expect((accessToken.exp ?? 0) - (accessToken.iat ?? 0)).toBe(result); // 5m lowest
		},
	);

	// Authorization Code and Refresh Token grants
	it.each([
		{
			testScopes: ["read:payments", "offline_access"],
			result: 1800, // 30m lowest
		},
		{
			testScopes: ["read:payments", "write:payments", "offline_access"],
			result: 300, // 5m lowest
		},
		{
			testScopes: ["profile", "offline_access"],
			result: 7200, // accessTokenExpiresIn 2hr
		},
	])(
		"scopeExpirations - access token expiration $testScopes",
		async ({ testScopes, result }) => {
			const { client, oauthClient } = await createTestInstance({
				oauthProviderConfig: {
					accessTokenExpiresIn: 7200,
					scopeExpirations: {
						"read:payments": "30m",
						"write:payments": "5m",
					},
				},
			});
			const { url: authUrl, codeVerifier } = await createAuthUrl(
				{
					clientId: oauthClient?.client_id!,
					clientSecret: oauthClient?.client_secret,
				},
				{
					scopes: testScopes,
				},
			);
			let callbackRedirectUrl = "";
			await client.$fetch(authUrl.toString(), {
				onError(context) {
					callbackRedirectUrl = context.response.headers.get("Location") || "";
				},
			});
			expect(callbackRedirectUrl).toContain(redirectUri);
			expect(callbackRedirectUrl).toContain(`code=`);
			expect(callbackRedirectUrl).toContain(`state=123`);
			const url = new URL(callbackRedirectUrl);

			// Authorization code
			const tokens = await client.oauth2.token({
				code: url.searchParams.get("code")!,
				code_verifier: codeVerifier,
				grant_type: "authorization_code",
				resource: validAudience,
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				redirect_uri: redirectUri,
			});
			expect(tokens.data?.expires_in).toBe(result); // 5m lowest
			// NOTE: verification is done in other tests (we only care about the exp fields in this test)
			const accessToken = decodeJwt(tokens.data?.access_token ?? "");
			expect((accessToken.exp ?? 0) - (accessToken.iat ?? 0)).toBe(result); // 5m lowest

			// Refresh token
			const refreshedTokens = await client.oauth2.token({
				resource: validAudience,
				// @ts-expect-error refresh token is sent
				refresh_token: tokens.data?.refresh_token,
				grant_type: "refresh_token",
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
			});
			expect(refreshedTokens.data?.expires_in).toBe(result); // 5m lowest
			// NOTE: verification is done in other tests (we only care about the exp fields in this test)
			const refreshedAccessToken = decodeJwt(
				refreshedTokens.data?.access_token ?? "",
			);
			expect(
				(refreshedAccessToken.exp ?? 0) - (refreshedAccessToken.iat ?? 0),
			).toBe(result); // 5m lowest
		},
	);

	it("opaqueAccessTokenPrefix - client_credentials", async () => {
		const prefix = "hello_";
		const testScopes = ["read:profile"];
		const { client, oauthClient } = await createTestInstance({
			oauthProviderConfig: {
				opaqueAccessTokenPrefix: prefix,
			},
		});
		// Client credentials
		const tokens = await client.oauth2.token({
			grant_type: "client_credentials",
			client_id: oauthClient?.client_id,
			client_secret: oauthClient?.client_secret,
			scope: testScopes.join(""),
		});
		expect(tokens.data?.access_token?.startsWith(prefix)).toBeTruthy();
	});

	it("opaqueAccessTokenPrefix, refreshTokenPrefix - code_authorization, refresh_token", async () => {
		const accessTokenPrefix = "hello__ac_";
		const refreshTokenPrefix = "hello_rt_";
		const { client, oauthClient } = await createTestInstance({
			oauthProviderConfig: {
				opaqueAccessTokenPrefix: accessTokenPrefix,
				refreshTokenPrefix: refreshTokenPrefix,
			},
		});
		const { url: authUrl, codeVerifier } = await createAuthUrl({
			clientId: oauthClient?.client_id!,
			clientSecret: oauthClient?.client_secret,
		});
		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackRedirectUrl).toContain(redirectUri);
		expect(callbackRedirectUrl).toContain(`code=`);
		expect(callbackRedirectUrl).toContain(`state=123`);
		const url = new URL(callbackRedirectUrl);

		// Authorization code
		const tokens = await client.oauth2.token({
			code: url.searchParams.get("code")!,
			code_verifier: codeVerifier,
			grant_type: "authorization_code",
			client_id: oauthClient?.client_id,
			client_secret: oauthClient?.client_secret,
			redirect_uri: redirectUri,
		});
		expect(
			tokens.data?.access_token?.startsWith(accessTokenPrefix),
		).toBeTruthy();
		if ("refresh_token" in (tokens.data ?? {})) {
			expect(
				(tokens.data as { refresh_token?: string }).refresh_token?.startsWith(
					refreshTokenPrefix,
				),
			).toBeTruthy();
		} else {
			expect.unreachable();
		}

		// Refresh token
		const refreshedTokens = await client.oauth2.token({
			// @ts-expect-error refresh token is sent
			refresh_token: tokens.data?.refresh_token,
			grant_type: "refresh_token",
			client_id: oauthClient?.client_id,
			client_secret: oauthClient?.client_secret,
		});
		expect(
			refreshedTokens.data?.access_token?.startsWith(accessTokenPrefix),
		).toBeTruthy();
		if ("refresh_token" in (refreshedTokens.data ?? {})) {
			expect(
				(
					refreshedTokens.data as { refresh_token?: string }
				).refresh_token?.startsWith(refreshTokenPrefix),
			).toBeTruthy();
		} else {
			expect.unreachable();
		}
	});

	it("clientSecretPrefix - client_credentials", async () => {
		const prefix = "hello_cs_";
		const testScopes = ["read:profile"];
		const { client, oauthClient } = await createTestInstance({
			oauthProviderConfig: {
				clientSecretPrefix: prefix,
			},
		});
		expect(oauthClient?.client_secret?.startsWith(prefix)).toBeTruthy();

		// Test successful utilization of client_secret
		const tokens = await client.oauth2.token({
			grant_type: "client_credentials",
			client_id: oauthClient?.client_id,
			client_secret: oauthClient?.client_secret,
			scope: testScopes.join(""),
		});
		expect(tokens.error?.status).toBeUndefined();
		expect(tokens.data?.access_token).toBeDefined();
	});
});
