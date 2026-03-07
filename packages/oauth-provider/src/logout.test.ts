import {
	createAuthorizationCodeRequest,
	createAuthorizationURL,
} from "@better-auth/core/oauth2";
import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import { toNodeHandler } from "better-auth/node";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { decodeJwt } from "jose";
import type { Listener } from "listhen";
import { listen } from "listhen";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthClient } from "./types/oauth";

type MakeRequired<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

describe("oauth logout", async () => {
	const port = 3004;
	const baseUrl = `http://localhost:${port}`;
	const rpBaseUrl = "http://localhost:5000";
	const state = "123";
	const scopes = ["openid", "email", "profile", "offline_access"];

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: baseUrl,
		plugins: [
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				allowDynamicClientRegistration: true,
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
				scopes,
			}),
			jwt(),
		],
	});
	let { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: baseUrl,
		fetchOptions: {
			customFetchImpl,
		},
	});
	let oauthClient: OAuthClient | null;
	let server: Listener;

	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;
	const logoutRedirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/logout`;

	// Registers a confidential client application to work with
	beforeAll(async () => {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
				enable_end_session: true,
			},
		});
		expect(response?.client_id).toBeDefined();
		expect(response?.user_id).toBeDefined();
		expect(response?.client_secret).toBeDefined();
		expect(response?.redirect_uris).toEqual([redirectUri]);
		expect(response?.enable_end_session).toEqual(true);
		oauthClient = response;

		server = await listen(toNodeHandler(auth.handler), {
			port,
		});
	});

	afterAll(async () => {
		if (server) {
			await server.close();
		}
	});

	// Login again after each test
	beforeEach(async () => {
		const { headers: _headers } = await signInWithTestUser();
		headers = _headers;
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
				...overrides?.options,
			},
			redirectURI: "",
			authorizationEndpoint: `${baseUrl}/api/auth/oauth2/authorize`,
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
				...overrides.options,
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

	it("should fail with invalid id_token_hint", async () => {
		const logoutRes = await client.oauth2.endSession({
			query: {
				id_token_hint: "",
			},
		});
		expect(logoutRes.error?.status).toBe(401);
	});

	it("should not allow registration of rp-initiated clients, specifically enable_end_session", async () => {
		const response = await client.oauth2.register(
			{
				redirect_uris: [redirectUri],
				post_logout_redirect_uris: [logoutRedirectUri],
				// @ts-expect-error only through adminCreateOAuthClient
				enable_end_session: true,
			},
			{
				headers,
			},
		);
		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.user_id).toBeDefined();
		expect(response.data?.client_secret).toBeDefined();
		expect(response?.data?.redirect_uris).toEqual([redirectUri]);
		expect(response.data?.post_logout_redirect_uris).toEqual([
			logoutRedirectUri,
		]);
		expect(response.data?.enable_end_session).toBeUndefined();
	});

	it("should fail for clients without enable_end_session access", async () => {
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
		expect(response?.enable_end_session).toBeUndefined();

		const { url: authUrl, codeVerifier } = await createAuthUrl({
			scopes,
			options: {
				clientId: response.client_id,
				clientSecret: response.client_secret,
				redirectURI: redirectUri,
			},
		});

		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			headers,
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
			options: {
				clientId: response.client_id,
				clientSecret: response.client_secret,
			},
		});
		expect(tokens.data?.access_token).toBeDefined(); // Note: Opaque
		expect(tokens.data?.id_token).toBeDefined();
		expect(tokens.data?.refresh_token).toBeDefined();
		expect(tokens.data?.scope).toBe(scopes.join(" "));

		// Id token should not have an sid claim
		const idToken = decodeJwt(tokens.data?.id_token!);
		expect(idToken.sid).toBeUndefined();

		const logoutRes = await client.oauth2.endSession({
			query: {
				id_token_hint: tokens.data?.id_token!,
			},
		});
		expect(logoutRes.error?.status).toBe(401);
	});

	it("should pass for clients with enable_end_session access", async () => {
		const { url: authUrl, codeVerifier } = await createAuthUrl({
			scopes,
		});

		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			headers,
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
		expect(tokens.data?.refresh_token).toBeDefined();
		expect(tokens.data?.scope).toBe(scopes.join(" "));

		// Id token should have an sid claim
		const idToken = decodeJwt(tokens.data?.id_token!);
		const sessionId = idToken.sid;
		expect(sessionId).toBeDefined();
		const sessionBefore = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(sessionBefore.data?.session.id).toBe(sessionId);

		const logoutRes = await client.oauth2.endSession({
			query: {
				id_token_hint: tokens.data?.id_token!,
			},
		});
		expect(logoutRes.data).toBeNull();
		expect(logoutRes.error).toBeNull();

		// Should have successfully logged out user
		const sessionAfter = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(sessionAfter.data).toBeNull();
		expect(sessionAfter.error).toBeNull();
	});

	it("should pass with redirection", async () => {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				enable_end_session: true,
				skip_consent: true,
				post_logout_redirect_uris: [logoutRedirectUri],
			},
		});
		expect(response?.client_id).toBeDefined();
		expect(response?.user_id).toBeDefined();
		expect(response?.client_secret).toBeDefined();
		expect(response?.redirect_uris).toEqual([redirectUri]);
		expect(response.post_logout_redirect_uris).toEqual([logoutRedirectUri]);
		expect(response?.enable_end_session).toBe(true);

		const { url: authUrl, codeVerifier } = await createAuthUrl({
			scopes,
			options: {
				clientId: response.client_id,
				clientSecret: response.client_secret,
				redirectURI: redirectUri,
			},
		});

		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			headers,
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
			options: {
				clientId: response.client_id,
				clientSecret: response.client_secret,
			},
		});
		expect(tokens.data?.access_token).toBeDefined(); // Note: Opaque
		expect(tokens.data?.id_token).toBeDefined();
		expect(tokens.data?.refresh_token).toBeDefined();
		expect(tokens.data?.scope).toBe(scopes.join(" "));

		// Id token should have an sid claim
		const idToken = decodeJwt(tokens.data?.id_token!);
		const sessionId = idToken.sid;
		expect(sessionId).toBeDefined();

		let logoutRedirectRes = "";
		const logoutRes = await client.oauth2.endSession(
			{
				query: {
					id_token_hint: tokens.data?.id_token!,
					post_logout_redirect_uri: logoutRedirectUri,
					state: "123",
				},
			},
			{
				onResponse(ctx) {
					logoutRedirectRes = ctx.response.headers.get("Location") || "";
				},
			},
		);
		expect(logoutRedirectRes).toContain(logoutRedirectUri);
		expect(logoutRedirectRes).toContain("state=123");
		expect(logoutRes.error?.status).toBe(302);
	});
});

describe("oauth logout - disableJwtPlugin", async () => {
	const port = 3005;
	const baseUrl = `http://localhost:${port}`;
	const rpBaseUrl = "http://localhost:5000";
	const state = "123";
	const scopes = ["openid", "email", "profile", "offline_access"];

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: baseUrl,
		plugins: [
			oauthProvider({
				disableJwtPlugin: true,
				loginPage: "/login",
				consentPage: "/consent",
				allowDynamicClientRegistration: true,
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
				scopes,
			}),
			jwt(),
		],
	});
	let { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: baseUrl,
		fetchOptions: {
			customFetchImpl,
		},
	});
	let oauthClient: OAuthClient | null;
	let server: Listener;

	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;
	const logoutRedirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/logout`;

	// Registers a confidential client application to work with
	beforeAll(async () => {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
				enable_end_session: true,
			},
		});
		expect(response?.client_id).toBeDefined();
		expect(response?.user_id).toBeDefined();
		expect(response?.client_secret).toBeDefined();
		expect(response?.redirect_uris).toEqual([redirectUri]);
		expect(response?.enable_end_session).toEqual(true);
		oauthClient = response;

		server = await listen(toNodeHandler(auth.handler), {
			port,
		});
	});

	afterAll(async () => {
		if (server) {
			await server.close();
		}
	});

	// Login again after each test
	beforeEach(async () => {
		const { headers: _headers } = await signInWithTestUser();
		headers = _headers;
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
				...overrides?.options,
			},
			redirectURI: "",
			authorizationEndpoint: `${baseUrl}/api/auth/oauth2/authorize`,
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
				...overrides.options,
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

	it("should pass for clients with enable_end_session access", async () => {
		const { url: authUrl, codeVerifier } = await createAuthUrl({
			scopes,
		});

		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			headers,
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
		expect(tokens.data?.refresh_token).toBeDefined();
		expect(tokens.data?.scope).toBe(scopes.join(" "));

		// Id token should have an sid claim
		const idToken = decodeJwt(tokens.data?.id_token!);
		const sessionId = idToken.sid;
		expect(sessionId).toBeDefined();
		const sessionBefore = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(sessionBefore.data?.session.id).toBe(sessionId);

		const logoutRes = await client.oauth2.endSession({
			query: {
				id_token_hint: tokens.data?.id_token!,
			},
		});
		expect(logoutRes.data).toBeNull();
		expect(logoutRes.error).toBeNull();

		// Should have successfully logged out user
		const sessionAfter = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(sessionAfter.data).toBeNull();
		expect(sessionAfter.error).toBeNull();
	});

	it("should pass with redirection", async () => {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				enable_end_session: true,
				skip_consent: true,
				post_logout_redirect_uris: [logoutRedirectUri],
			},
		});
		expect(response?.client_id).toBeDefined();
		expect(response?.user_id).toBeDefined();
		expect(response?.client_secret).toBeDefined();
		expect(response?.redirect_uris).toEqual([redirectUri]);
		expect(response.post_logout_redirect_uris).toEqual([logoutRedirectUri]);
		expect(response?.enable_end_session).toBe(true);

		const { url: authUrl, codeVerifier } = await createAuthUrl({
			scopes,
			options: {
				clientId: response.client_id,
				clientSecret: response.client_secret,
				redirectURI: redirectUri,
			},
		});

		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			headers,
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
			options: {
				clientId: response.client_id,
				clientSecret: response.client_secret,
			},
		});
		expect(tokens.data?.access_token).toBeDefined(); // Note: Opaque
		expect(tokens.data?.id_token).toBeDefined();
		expect(tokens.data?.refresh_token).toBeDefined();
		expect(tokens.data?.scope).toBe(scopes.join(" "));

		// Id token should have an sid claim
		const idToken = decodeJwt(tokens.data?.id_token!);
		const sessionId = idToken.sid;
		expect(sessionId).toBeDefined();

		let logoutRedirectRes = "";
		const logoutRes = await client.oauth2.endSession(
			{
				query: {
					id_token_hint: tokens.data?.id_token!,
					post_logout_redirect_uri: logoutRedirectUri,
				},
			},
			{
				onResponse(ctx) {
					logoutRedirectRes = ctx.response.headers.get("Location") || "";
				},
			},
		);
		expect(logoutRedirectRes).toBe(logoutRedirectUri);
		expect(logoutRes.error?.status).toBe(302);
	});
});
