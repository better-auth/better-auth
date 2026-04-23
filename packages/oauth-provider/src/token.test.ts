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
import { oauthProviderClient } from "./client.js";
import { oauthProvider } from "./oauth.js";
import type { OAuthOptions, Scope, VerificationValue } from "./types/index.js";
import type { OAuthClient } from "./types/oauth.js";
import { verificationValueSchema } from "./types/zod.js";

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

describe("id token claim override security", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
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
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
				customIdTokenClaims: () => ({
					acr: "silver",
					auth_time: 0,
					sub: "evil",
					iss: "https://evil.com",
					aud: "evil-client",
					nonce: "evil-nonce",
					iat: 0,
					exp: 0,
					sid: "evil-sid",
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
	});

	async function getIdTokenClaims() {
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
		return decodeJwt(tokens.data!.id_token!);
	}

	it("customIdTokenClaims can override acr and auth_time", async ({
		expect,
	}) => {
		const claims = await getIdTokenClaims();
		expect(claims.acr).toBe("silver");
		expect(claims.auth_time).toBe(0);
	});

	it("customIdTokenClaims cannot override pinned security claims", async ({
		expect,
	}) => {
		const claims = await getIdTokenClaims();
		expect(claims.sub).not.toBe("evil");
		expect(claims.iss).not.toBe("https://evil.com");
		expect(claims.aud).not.toBe("evil-client");
		expect(claims.nonce).not.toBe("evil-nonce");
		expect(claims.iat).not.toBe(0);
		expect(claims.exp).not.toBe(0);
		expect(claims.sid).not.toBe("evil-sid");
	});
});

describe("loopback redirect URI matching", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
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
		],
	});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient(), jwtClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: { customFetchImpl, headers },
	});

	const providerId = "test";
	const state = "123";

	it("127.0.0.1 with different ports should succeed", async ({ expect }) => {
		const registeredUri = "http://127.0.0.1:8080/callback";
		const requestedUri = "http://127.0.0.1:9090/callback";

		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: { redirect_uris: [registeredUri], skip_consent: true },
		});

		const codeVerifier = generateRandomString(32);
		const url = await createAuthorizationURL({
			id: providerId,
			options: {
				clientId: oauthClient!.client_id!,
				clientSecret: oauthClient!.client_secret!,
				redirectURI: requestedUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
			state,
			scopes: ["openid"],
			codeVerifier,
		});

		let callbackRedirectUrl = "";
		await client.$fetch(url.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackRedirectUrl).toContain("code=");

		const code = new URL(callbackRedirectUrl).searchParams.get("code")!;
		const { body, headers: reqHeaders } = createAuthorizationCodeRequest({
			code,
			codeVerifier,
			redirectURI: requestedUri,
			options: {
				clientId: oauthClient!.client_id!,
				clientSecret: oauthClient!.client_secret!,
				redirectURI: requestedUri,
			},
		});

		const tokens = await client.$fetch<{ access_token?: string }>(
			"/oauth2/token",
			{ method: "POST", body, headers: reqHeaders },
		);
		expect(tokens.data?.access_token).toBeDefined();
	});

	it("[::1] with different ports should succeed", async ({ expect }) => {
		const registeredUri = "http://[::1]:8080/callback";
		const requestedUri = "http://[::1]:3000/callback";

		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: { redirect_uris: [registeredUri], skip_consent: true },
		});

		const codeVerifier = generateRandomString(32);
		const url = await createAuthorizationURL({
			id: providerId,
			options: {
				clientId: oauthClient!.client_id!,
				clientSecret: oauthClient!.client_secret!,
				redirectURI: requestedUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
			state,
			scopes: ["openid"],
			codeVerifier,
		});

		let callbackRedirectUrl = "";
		await client.$fetch(url.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackRedirectUrl).toContain("code=");

		const code = new URL(callbackRedirectUrl).searchParams.get("code")!;
		const { body, headers: reqHeaders } = createAuthorizationCodeRequest({
			code,
			codeVerifier,
			redirectURI: requestedUri,
			options: {
				clientId: oauthClient!.client_id!,
				clientSecret: oauthClient!.client_secret!,
				redirectURI: requestedUri,
			},
		});

		const tokens = await client.$fetch<{ access_token?: string }>(
			"/oauth2/token",
			{ method: "POST", body, headers: reqHeaders },
		);
		expect(tokens.data?.access_token).toBeDefined();
	});

	it("non-loopback with different ports should be rejected", async ({
		expect,
	}) => {
		const registeredUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;
		const requestedUri = "http://localhost:9999/api/auth/oauth2/callback/test";

		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: { redirect_uris: [registeredUri], skip_consent: true },
		});

		const codeVerifier = generateRandomString(32);
		const url = await createAuthorizationURL({
			id: providerId,
			options: {
				clientId: oauthClient!.client_id!,
				clientSecret: oauthClient!.client_secret!,
				redirectURI: requestedUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
			state,
			scopes: ["openid"],
			codeVerifier,
		});

		let callbackRedirectUrl = "";
		await client.$fetch(url.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackRedirectUrl).toContain("invalid_redirect");
		expect(callbackRedirectUrl).not.toContain("code=");
	});

	it("loopback with different path should be rejected", async ({ expect }) => {
		const registeredUri = "http://127.0.0.1:8080/callback";
		const requestedUri = "http://127.0.0.1:8080/other-path";

		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: { redirect_uris: [registeredUri], skip_consent: true },
		});

		const codeVerifier = generateRandomString(32);
		const url = await createAuthorizationURL({
			id: providerId,
			options: {
				clientId: oauthClient!.client_id!,
				clientSecret: oauthClient!.client_secret!,
				redirectURI: requestedUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
			state,
			scopes: ["openid"],
			codeVerifier,
		});

		let callbackRedirectUrl = "";
		await client.$fetch(url.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackRedirectUrl).toContain("invalid_redirect");
		expect(callbackRedirectUrl).not.toContain("code=");
	});
});

describe("scope preservation through authorization code flow", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
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
		],
	});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient(), jwtClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: { customFetchImpl, headers },
	});

	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;
	const state = "123";

	it("scopes from authorization request should survive into token response", async ({
		expect,
	}) => {
		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: { redirect_uris: [redirectUri], skip_consent: true },
		});

		const requestedScopes = ["openid", "profile", "email"];
		const codeVerifier = generateRandomString(32);
		const url = await createAuthorizationURL({
			id: providerId,
			options: {
				clientId: oauthClient!.client_id!,
				clientSecret: oauthClient!.client_secret!,
				redirectURI: redirectUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
			state,
			scopes: requestedScopes,
			codeVerifier,
		});

		let callbackRedirectUrl = "";
		await client.$fetch(url.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackRedirectUrl).toContain("code=");

		const code = new URL(callbackRedirectUrl).searchParams.get("code")!;
		const { body, headers: reqHeaders } = createAuthorizationCodeRequest({
			code,
			codeVerifier,
			redirectURI: redirectUri,
			options: {
				clientId: oauthClient!.client_id!,
				clientSecret: oauthClient!.client_secret!,
				redirectURI: redirectUri,
			},
		});

		const tokens = await client.$fetch<{ scope?: string }>("/oauth2/token", {
			method: "POST",
			body,
			headers: reqHeaders,
		});
		expect(tokens.data?.scope).toBe(requestedScopes.join(" "));
	});
});

describe("customTokenResponseFields", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
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
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
				customTokenResponseFields: ({ grantType, verificationValue }) => {
					if (
						grantType === "authorization_code" &&
						verificationValue?.referenceId
					) {
						return { org_id: verificationValue.referenceId };
					}
					return { server_time: "2024-01-01" };
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
	const state = "custom-fields-test";

	beforeAll(async () => {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
			},
		});
		oauthClient = response;
	});

	it("should include custom fields in authorization_code token response", async () => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const codeVerifier = generateRandomString(32);
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
			scopes: ["openid"],
			codeVerifier,
		});

		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});

		const url = new URL(callbackRedirectUrl);
		const code = url.searchParams.get("code")!;

		const { body, headers: tokenHeaders } = createAuthorizationCodeRequest({
			code,
			codeVerifier,
			redirectURI: redirectUri,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
			},
		});

		const tokens = await client.$fetch<{
			access_token?: string;
			server_time?: string;
			[key: string]: unknown;
		}>("/oauth2/token", {
			method: "POST",
			body,
			headers: tokenHeaders,
		});

		expect(tokens.data?.access_token).toBeDefined();
		expect(tokens.data?.server_time).toBe("2024-01-01");
	});

	it("should not allow custom fields to override standard OAuth fields", async () => {
		const authServerBaseUrl2 = "http://localhost:3000";
		const {
			auth: auth2,
			signInWithTestUser: signIn2,
			customFetchImpl: fetch2,
		} = await getTestInstance({
			baseURL: authServerBaseUrl2,
			plugins: [
				jwt({ jwt: { issuer: authServerBaseUrl2 } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
					customTokenResponseFields: () => ({
						access_token: "should-be-ignored",
						token_type: "should-be-ignored",
						custom_field: "should-be-present",
					}),
				}),
			],
		});

		const { headers: headers2 } = await signIn2();
		const client2 = createAuthClient({
			plugins: [oauthProviderClient(), jwtClient()],
			baseURL: authServerBaseUrl2,
			fetchOptions: { customFetchImpl: fetch2, headers: headers2 },
		});

		const response = await auth2.api.adminCreateOAuthClient({
			headers: headers2,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
			},
		});

		const codeVerifier = generateRandomString(32);
		const authUrl = await createAuthorizationURL({
			id: providerId,
			options: {
				clientId: response!.client_id!,
				clientSecret: response!.client_secret!,
				redirectURI: redirectUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${authServerBaseUrl2}/api/auth/oauth2/authorize`,
			state,
			scopes: ["openid"],
			codeVerifier,
		});

		let callbackUrl = "";
		await client2.$fetch(authUrl.toString(), {
			onError(context) {
				callbackUrl = context.response.headers.get("Location") || "";
			},
		});

		const code = new URL(callbackUrl).searchParams.get("code")!;
		const { body, headers: tokenHeaders } = createAuthorizationCodeRequest({
			code,
			codeVerifier,
			redirectURI: redirectUri,
			options: {
				clientId: response!.client_id!,
				clientSecret: response!.client_secret!,
				redirectURI: redirectUri,
			},
		});

		const tokens = await client2.$fetch<{
			access_token?: string;
			token_type?: string;
			custom_field?: string;
			[key: string]: unknown;
		}>("/oauth2/token", {
			method: "POST",
			body,
			headers: tokenHeaders,
		});

		expect(tokens.data?.access_token).not.toBe("should-be-ignored");
		expect(tokens.data?.token_type).toBe("Bearer");
		expect(tokens.data?.custom_field).toBe("should-be-present");
	});

	it("should include custom fields in client_credentials token response", async () => {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const { body, headers: tokenHeaders } = createClientCredentialsTokenRequest(
			{
				options: {
					clientId: oauthClient.client_id,
					clientSecret: oauthClient.client_secret,
					redirectURI: redirectUri,
				},
			},
		);

		const tokens = await client.$fetch<{
			access_token?: string;
			server_time?: string;
			[key: string]: unknown;
		}>("/oauth2/token", {
			method: "POST",
			body,
			headers: tokenHeaders,
		});

		expect(tokens.data?.access_token).toBeDefined();
		expect(tokens.data?.server_time).toBe("2024-01-01");
	});
});

describe("verificationValueSchema", () => {
	it("should validate a well-formed verification value", () => {
		const value: VerificationValue = {
			type: "authorization_code",
			query: {
				response_type: "code",
				client_id: "test-client",
				redirect_uri: "https://example.com/callback",
				scope: "openid",
				state: "abc123",
			},
			userId: "user-1",
			sessionId: "session-1",
		};

		const result = verificationValueSchema.safeParse(value);
		expect(result.success).toBe(true);
	});

	it("should reject a verification value with wrong type", () => {
		const result = verificationValueSchema.safeParse({
			type: "password_reset",
			query: {
				client_id: "test",
				redirect_uri: "https://example.com",
				state: "abc",
			},
			userId: "u1",
			sessionId: "s1",
		});
		expect(result.success).toBe(false);
	});

	it("should reject a verification value missing required fields", () => {
		const result = verificationValueSchema.safeParse({
			type: "authorization_code",
			query: {
				client_id: "test",
				redirect_uri: "https://example.com",
				state: "abc",
			},
		});
		expect(result.success).toBe(false);
	});

	it("should pass through unknown fields for extensibility", () => {
		const value = {
			type: "authorization_code",
			query: {
				client_id: "test",
				redirect_uri: "https://example.com",
				state: "abc",
			},
			userId: "u1",
			sessionId: "s1",
			futureField: "should-pass-through",
		};

		const result = verificationValueSchema.safeParse(value);
		expect(result.success).toBe(true);
		if (result.success) {
			expect((result.data as Record<string, unknown>).futureField).toBe(
				"should-pass-through",
			);
		}
	});
});
