import { createClientCredentialsTokenRequest } from "@better-auth/core/oauth2";
import { createAuthClient } from "better-auth/client";
import { jwtClient } from "better-auth/client/plugins";
import { generateRandomString } from "better-auth/crypto";
import type { ProviderOptions } from "better-auth/oauth2";
import {
	createAuthorizationCodeRequest,
	createAuthorizationURL,
	createRefreshAccessTokenRequest,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { createLocalJWKSet, decodeJwt, jwtVerify } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthOptions, Scope } from "./types";
import type { OAuthClient } from "./types/oauth";

type MakeRequired<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

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
		const response = await auth.api.adminCreateOAuthClient({
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
		const response = await authorizationServer.api.adminCreateOAuthClient({
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

	it("should preserve auth_time in id_token after refresh (OIDC Core 1.0 Section 12.2)", async ({
		expect,
	}) => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const scopes = ["openid", "profile", "offline_access"];
		const tokens = await authorizeForRefreshToken(scopes);
		expect(tokens?.id_token).toBeDefined();
		expect(tokens?.refresh_token).toBeDefined();

		const originalIdToken = decodeJwt(tokens!.id_token!);
		expect(originalIdToken.auth_time).toBeDefined();

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
			[key: string]: unknown;
		}>("/oauth2/token", {
			method: "POST",
			body: body,
			headers: headers,
		});
		expect(newTokens.data?.id_token).toBeDefined();

		const refreshedIdToken = decodeJwt(newTokens.data!.id_token!);
		expect(refreshedIdToken.auth_time).toBe(originalIdToken.auth_time);
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

	it("should refresh token even when removing offline_scope", async ({
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
		expect(newTokens.data?.refresh_token).toBeDefined();
		expect(tokens?.refresh_token).not.toEqual(newTokens.data?.refresh_token);
		expect(newTokens.data?.scope).toBe(newScopes.join(" "));
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

	it("should prevent replay attacks", async () => {
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

		// Replay original tokens
		const replayedTokens = await client.$fetch<{
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
		expect(replayedTokens.error?.status).toBeDefined();

		// New tokens should not work either
		const { body: newBody, headers: newHeaders } =
			createRefreshAccessTokenRequest({
				refreshToken: newTokens?.data?.refresh_token!,
				options: {
					clientId: oauthClient.client_id,
					clientSecret: oauthClient.client_secret,
					redirectURI: redirectUri,
				},
			});
		const newTokensRefresh = await client.$fetch<{
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
			body: newBody,
			headers: newHeaders,
		});
		expect(newTokensRefresh.error?.status).toBeDefined();
	});
});

describe("oauth token - client_credentials", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const validAudience = "https://myapi.example.com";
	const allScopes = ["openid", "profile", "email", "read:posts", "write:posts"];
	const clientScopes = ["openid", "profile", "email", "read:posts"];
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
				allowDynamicClientRegistration: true,
				scopes: allScopes,
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
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
				scope: clientScopes.join(" "),
			},
		});
		expect(response?.client_id).toBeDefined();
		expect(response?.user_id).toBeDefined();
		expect(response?.client_secret).toBeDefined();
		expect(response?.redirect_uris).toEqual([redirectUri]);
		expect(response?.scope).toEqual(clientScopes.join(" "));
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

	it("should match created client scopes", async ({ expect }) => {
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
		expect(tokens.data?.access_token).toBeDefined();
		expect(tokens.data?.id_token).toBeUndefined();
		expect(tokens.data?.refresh_token).toBeUndefined();
		expect(tokens.data?.scope).toBe(clientScopes.join(" "));
		expect(tokens.data?.expires_in).toBe(3600);
		expect(tokens.data?.expires_at).toBeDefined();
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

describe("oauth token - customIdTokenClaims precedence", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const { auth, signInWithTestUser, customFetchImpl, testUser } =
		await getTestInstance({
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
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
					customIdTokenClaims: () => ({
						given_name: "CustomFirst",
						family_name: "CustomLast",
						custom_field: "custom_value",
					}),
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

	beforeAll(async () => {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
			},
		});
		expect(response?.client_id).toBeDefined();
		expect(response?.client_secret).toBeDefined();
		expect(response?.redirect_uris).toBeDefined();
		oauthClient = response;

		const jwksResult = await client.jwks();
		if (!jwksResult.data) {
			throw new Error("Unable to fetch jwks");
		}
		jwks = createLocalJWKSet(jwksResult.data);
	});

	it("custom claims should override standard profile claims in id_token", async ({
		expect,
	}) => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const scopes = ["openid", "profile"];
		const codeVerifier = generateRandomString(32);
		const url = await createAuthorizationURL({
			id: providerId,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
			state,
			scopes,
			codeVerifier,
		});

		let callbackRedirectUrl = "";
		await client.$fetch(url.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackRedirectUrl).not.toBe("");
		expect(callbackRedirectUrl).toContain(redirectUri);

		const callbackUrl = new URL(callbackRedirectUrl);
		const code = callbackUrl.searchParams.get("code");
		const returnedState = callbackUrl.searchParams.get("state");

		expect(code).toBeTruthy();
		expect(returnedState).toBe(state);

		const { body, headers: reqHeaders } = createAuthorizationCodeRequest({
			code: code!,
			codeVerifier,
			redirectURI: redirectUri,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
			},
		});

		const tokens = await client.$fetch<{
			id_token?: string;
			[key: string]: unknown;
		}>("/oauth2/token", {
			method: "POST",
			body,
			headers: reqHeaders,
		});

		expect(tokens.data?.id_token).toBeDefined();
		const idToken = await jwtVerify(tokens.data?.id_token!, jwks);

		// Custom claims must override the auto-derived profile claims
		expect(idToken.payload.given_name).toBe("CustomFirst");
		expect(idToken.payload.family_name).toBe("CustomLast");
		expect(idToken.payload.custom_field).toBe("custom_value");

		// Standard name should still come from the user record (not overridden)
		expect(idToken.payload.name).toBe(testUser.name);
		expect(idToken.payload.sub).toBeDefined();
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
	it.for([
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
	])("scopeExpirations - access token expiration $testScopes", async ({
		testScopes,
		result,
	}) => {
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
		const tokens = await client.oauth2.token(
			{
				resource: validAudience,
				grant_type: "client_credentials",
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				scope: testScopes.join(" "),
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(tokens.data?.expires_in).toBe(result); // 5m lowest
		// NOTE: verification is done in other tests (we only care about the exp fields in this test)
		const accessToken = decodeJwt(tokens.data?.access_token ?? "");
		expect((accessToken.exp ?? 0) - (accessToken.iat ?? 0)).toBe(result); // 5m lowest
	});

	// Authorization Code and Refresh Token grants
	it.for([
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
	])("scopeExpirations - access token expiration $testScopes", async ({
		testScopes,
		result,
	}) => {
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
		const tokens = await client.oauth2.token(
			{
				code: url.searchParams.get("code")!,
				code_verifier: codeVerifier,
				grant_type: "authorization_code",
				resource: validAudience,
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				redirect_uri: redirectUri,
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(tokens.data?.expires_in).toBe(result); // 5m lowest
		// NOTE: verification is done in other tests (we only care about the exp fields in this test)
		const accessToken = decodeJwt(tokens.data?.access_token ?? "");
		expect((accessToken.exp ?? 0) - (accessToken.iat ?? 0)).toBe(result); // 5m lowest

		// Refresh token
		const refreshedTokens = await client.oauth2.token(
			{
				resource: validAudience,
				// @ts-expect-error refresh token is sent
				refresh_token: tokens.data?.refresh_token,
				grant_type: "refresh_token",
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
		expect(refreshedTokens.data?.expires_in).toBe(result); // 5m lowest
		// NOTE: verification is done in other tests (we only care about the exp fields in this test)
		const refreshedAccessToken = decodeJwt(
			refreshedTokens.data?.access_token ?? "",
		);
		expect(
			(refreshedAccessToken.exp ?? 0) - (refreshedAccessToken.iat ?? 0),
		).toBe(result); // 5m lowest
	});

	it("opaqueAccessTokenPrefix - client_credentials", async () => {
		const prefix = "hello_";
		const testScopes = ["read:profile"];
		const { client, oauthClient } = await createTestInstance({
			oauthProviderConfig: {
				prefix: {
					opaqueAccessToken: prefix,
				},
			},
		});
		// Client credentials
		const tokens = await client.oauth2.token(
			{
				grant_type: "client_credentials",
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				scope: testScopes.join(" "),
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(tokens.data?.access_token?.startsWith(prefix)).toBeTruthy();
	});

	it("opaqueAccessTokenPrefix, refreshTokenPrefix - code_authorization, refresh_token", async () => {
		const accessTokenPrefix = "hello__ac_";
		const refreshTokenPrefix = "hello_rt_";
		const { client, oauthClient } = await createTestInstance({
			oauthProviderConfig: {
				prefix: {
					opaqueAccessToken: accessTokenPrefix,
					refreshToken: refreshTokenPrefix,
				},
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
		const tokens = await client.oauth2.token(
			{
				code: url.searchParams.get("code")!,
				code_verifier: codeVerifier,
				grant_type: "authorization_code",
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				redirect_uri: redirectUri,
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
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
		const refreshedTokens = await client.oauth2.token(
			{
				// @ts-expect-error refresh token is sent
				refresh_token: tokens.data?.refresh_token,
				grant_type: "refresh_token",
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
				prefix: {
					clientSecret: prefix,
				},
			},
		});
		expect(oauthClient?.client_secret?.startsWith(prefix)).toBeTruthy();

		// Test successful utilization of client_secret
		const tokens = await client.oauth2.token(
			{
				grant_type: "client_credentials",
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				scope: testScopes.join(""),
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(tokens.error?.status).toBeUndefined();
		expect(tokens.data?.access_token).toBeDefined();
	});
});

describe("oauth token - client secret validation", async () => {
	const authServerBaseUrl = "http://localhost:3010";
	const rpBaseUrl = "http://localhost:5010";
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

	async function createValidationInstance(opts?: {
		oauthProviderConfig?: Omit<
			OAuthOptions<Scope[]>,
			"loginPage" | "consentPage"
		>;
	}) {
		const { auth, customFetchImpl, signInWithTestUser, db } =
			await getTestInstance({
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
		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
			},
		});

		return { client, oauthClient, db };
	}

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8016
	 */
	it("should return invalid_client for encrypted client secret format mismatch", async () => {
		const storedClientSecret = "Mda8BIefhR8eFkYfFq8H7XAW-fj8GNjQYKPfN8LZ6u8";
		const { client, oauthClient, db } = await createValidationInstance({
			oauthProviderConfig: {
				storeClientSecret: "encrypted",
				disableJwtPlugin: true,
			},
		});
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}
		await db.update({
			model: "oauthClient",
			where: [{ field: "clientId", value: oauthClient.client_id }],
			update: { clientSecret: storedClientSecret },
		});

		let responseStatus = 0;
		const tokenResponse = await client.oauth2.token(
			{
				grant_type: "client_credentials",
				client_id: oauthClient.client_id,
				client_secret: oauthClient.client_secret,
				scope: "read:profile",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
				onError(context) {
					responseStatus = context.response.status;
				},
			},
		);
		expect(responseStatus).toBe(401);
		expect(tokenResponse.error).toMatchObject({
			error: "invalid_client",
			error_description: "invalid client_secret",
		});
	});

	it("should propagate custom decrypt storage errors during client secret verification", async () => {
		const { client, oauthClient } = await createValidationInstance({
			oauthProviderConfig: {
				storeClientSecret: {
					encrypt: async (clientSecret) => clientSecret,
					decrypt: async () => {
						throw new Error("decrypt service unavailable");
					},
				},
				disableJwtPlugin: true,
			},
		});
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		let responseStatus = 0;
		await client.oauth2.token(
			{
				grant_type: "client_credentials",
				client_id: oauthClient.client_id,
				client_secret: oauthClient.client_secret,
				scope: "read:profile",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
				onError(context) {
					responseStatus = context.response.status;
				},
			},
		);
		expect(responseStatus).toBe(500);
	});
});

describe("oauth token - custom grant types via extensions", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const CUSTOM_GRANT = "urn:test:custom-grant";
	const CUSTOM_GRANT_B = "urn:test:custom-grant-b";

	const customGrantPlugin = {
		id: "custom-grant-plugin",
		dependencies: ["oauth-provider"],
		extensions: {
			"oauth-provider": {
				grantTypes: {
					[CUSTOM_GRANT]: async (ctx) => {
						return ctx.json({
							access_token: "custom-token-value",
							token_type: "Bearer",
							expires_in: 3600,
							scope: "custom",
							custom_field: ctx.body?.custom_param ?? "none",
						});
					},
				},
				grantTypeURIs: [CUSTOM_GRANT],
			},
		},
	} satisfies import("better-auth/types").BetterAuthPlugin;

	const secondGrantPlugin = {
		id: "second-grant-plugin",
		dependencies: ["oauth-provider"],
		extensions: {
			"oauth-provider": {
				grantTypes: {
					[CUSTOM_GRANT_B]: async (ctx) => {
						return ctx.json({
							access_token: "second-custom-token",
							token_type: "Bearer",
							expires_in: 1800,
							scope: "second",
						});
					},
				},
				grantTypeURIs: [CUSTOM_GRANT_B],
			},
		},
	} satisfies import("better-auth/types").BetterAuthPlugin;

	const { auth, signInWithTestUser } = await getTestInstance({
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
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
			customGrantPlugin,
			secondGrantPlugin,
		],
	});

	const { headers } = await signInWithTestUser();
	let oauthClient: OAuthClient | null;

	beforeAll(async () => {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: ["http://localhost:5000/callback"],
				skip_consent: true,
			},
		});
		oauthClient = response;
	});

	it("should dispatch to a custom grant handler", async () => {
		const response = await auth.handler(
			new Request(`${authServerBaseUrl}/api/auth/oauth2/token`, {
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					authorization: `Basic ${btoa(`${oauthClient!.client_id}:${oauthClient!.client_secret}`)}`,
				},
				body: new URLSearchParams({
					grant_type: CUSTOM_GRANT,
				}).toString(),
			}),
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.access_token).toBe("custom-token-value");
		expect(body.token_type).toBe("Bearer");
		expect(body.scope).toBe("custom");
	});

	it("should pass through extra body fields", async () => {
		const response = await auth.handler(
			new Request(`${authServerBaseUrl}/api/auth/oauth2/token`, {
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					authorization: `Basic ${btoa(`${oauthClient!.client_id}:${oauthClient!.client_secret}`)}`,
				},
				body: new URLSearchParams({
					grant_type: CUSTOM_GRANT,
					custom_param: "my-custom-value",
				}).toString(),
			}),
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.custom_field).toBe("my-custom-value");
	});

	it("should reject unknown grant types not in allowlist", async () => {
		const response = await auth.handler(
			new Request(`${authServerBaseUrl}/api/auth/oauth2/token`, {
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					authorization: `Basic ${btoa(`${oauthClient!.client_id}:${oauthClient!.client_secret}`)}`,
				},
				body: new URLSearchParams({
					grant_type: "urn:unknown:not-registered",
				}).toString(),
			}),
		);

		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toBe("unsupported_grant_type");
	});

	it("should support multiple plugins each registering different grant types", async () => {
		const response = await auth.handler(
			new Request(`${authServerBaseUrl}/api/auth/oauth2/token`, {
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					authorization: `Basic ${btoa(`${oauthClient!.client_id}:${oauthClient!.client_secret}`)}`,
				},
				body: new URLSearchParams({
					grant_type: CUSTOM_GRANT_B,
				}).toString(),
			}),
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.access_token).toBe("second-custom-token");
		expect(body.scope).toBe("second");
	});

	it("should include extension grantTypeURIs in discovery metadata", async () => {
		const metadata = (await auth.api.getOAuthServerConfig()) as Record<
			string,
			unknown
		>;
		expect(metadata.grant_types_supported as string[]).toContain(CUSTOM_GRANT);
		expect(metadata.grant_types_supported as string[]).toContain(
			CUSTOM_GRANT_B,
		);
		expect(metadata.grant_types_supported as string[]).toContain(
			"authorization_code",
		);
	});
});

describe("oauth token - extension metadata contributions", async () => {
	const authServerBaseUrl = "http://localhost:3000";

	const metadataPlugin = {
		id: "metadata-plugin",
		dependencies: ["oauth-provider"],
		extensions: {
			"oauth-provider": {
				metadata: ({ baseURL }) => ({
					backchannel_authentication_endpoint: `${baseURL}/oauth2/bc-authorize`,
					custom_flag: true,
				}),
				tokenEndpointAuthMethods: ["private_key_jwt"],
			},
		},
	} satisfies import("better-auth/types").BetterAuthPlugin;

	const secondMetadataPlugin = {
		id: "second-metadata-plugin",
		dependencies: ["oauth-provider"],
		extensions: {
			"oauth-provider": {
				metadata: () => ({
					pushed_authorization_request_endpoint: "/par",
				}),
			},
		},
	} satisfies import("better-auth/types").BetterAuthPlugin;

	const { auth } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt({ jwt: { issuer: authServerBaseUrl } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
			metadataPlugin,
			secondMetadataPlugin,
		],
	});

	it("should include extension metadata in discovery response", async () => {
		const metadata = (await auth.api.getOAuthServerConfig()) as Record<
			string,
			unknown
		>;
		expect(metadata.backchannel_authentication_endpoint).toContain(
			"/oauth2/bc-authorize",
		);
		expect(metadata.custom_flag).toBe(true);
	});

	it("should merge metadata from multiple plugins", async () => {
		const metadata = (await auth.api.getOAuthServerConfig()) as Record<
			string,
			unknown
		>;
		expect(metadata.backchannel_authentication_endpoint).toBeDefined();
		expect(metadata.pushed_authorization_request_endpoint).toBe("/par");
	});

	it("should merge extension tokenEndpointAuthMethods", async () => {
		const metadata = (await auth.api.getOAuthServerConfig()) as Record<
			string,
			unknown
		>;
		expect(metadata.token_endpoint_auth_methods_supported).toContain(
			"private_key_jwt",
		);
		expect(metadata.token_endpoint_auth_methods_supported).toContain(
			"client_secret_basic",
		);
	});
});

describe("oauth token - extension token claims", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const validAudience = "https://myapi.example.com";

	const claimsPlugin = {
		id: "claims-plugin",
		dependencies: ["oauth-provider"],
		extensions: {
			"oauth-provider": {
				tokenClaims: {
					access: async () => ({
						custom_access_claim: "from-extension",
						overridable_claim: "extension-value",
					}),
					id: async () => ({
						verified_claims: { trust_framework: "eidas" },
					}),
				},
			},
		},
	} satisfies import("better-auth/types").BetterAuthPlugin;

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt({ jwt: { issuer: authServerBaseUrl } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				validAudiences: [validAudience],
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
				customAccessTokenClaims: async () => ({
					overridable_claim: "user-wins",
				}),
			}),
			claimsPlugin,
		],
	});

	const { headers } = await signInWithTestUser();
	const _client = createAuthClient({
		plugins: [oauthProviderClient(), jwtClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: { customFetchImpl, headers },
	});
	let oauthClient: OAuthClient | null;

	const providerId = "test-claims";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;

	beforeAll(async () => {
		oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
			},
		});
	});

	async function getTokensViaAuthCode(scopes: string[], resource?: string) {
		const codeVerifier = generateRandomString(32);
		const url = await createAuthorizationURL({
			id: "test-claims",
			options: {
				clientId: oauthClient!.client_id,
				clientSecret: oauthClient!.client_secret!,
				redirectURI: redirectUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
			state: "test-state",
			scopes,
			codeVerifier,
			resource,
		});

		const authRes = await auth.handler(
			new Request(url.toString(), { headers }),
		);
		const location = authRes.headers.get("location")!;
		const code = new URL(location).searchParams.get("code")!;

		const { body: tokenBody, headers: tokenHeaders } =
			createAuthorizationCodeRequest({
				code,
				codeVerifier,
				redirectURI: redirectUri,
				resource,
				options: {
					clientId: oauthClient!.client_id,
					clientSecret: oauthClient!.client_secret!,
					redirectURI: redirectUri,
				},
			});

		const tokenRes = await auth.handler(
			new Request(`${authServerBaseUrl}/api/auth/oauth2/token`, {
				method: "POST",
				headers: tokenHeaders,
				body: tokenBody,
			}),
		);
		expect(tokenRes.status).toBe(200);
		return tokenRes.json();
	}

	it("should include extension claims in JWT access tokens", async () => {
		const tokenBody = await getTokensViaAuthCode(["openid"], validAudience);

		const decoded = decodeJwt(tokenBody.access_token);
		expect(decoded.custom_access_claim).toBe("from-extension");
	});

	it("should let user customAccessTokenClaims override extension claims", async () => {
		const tokenBody = await getTokensViaAuthCode(["openid"], validAudience);

		const decoded = decodeJwt(tokenBody.access_token);
		expect(decoded.overridable_claim).toBe("user-wins");
	});

	it("should include extension claims in ID tokens", async () => {
		const tokenBody = await getTokensViaAuthCode(["openid"]);

		expect(tokenBody.id_token).toBeDefined();
		const decoded = decodeJwt(tokenBody.id_token);
		expect(decoded.verified_claims).toEqual({
			trust_framework: "eidas",
		});
	});
});
