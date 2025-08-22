import { beforeAll, describe, it, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { jwt } from "../jwt";
import { oauthProvider } from "./oauth";
import { createAuthClient } from "../../client";
import type { OAuthClient } from "../../oauth-2.1/types";
import { oauthProviderClient } from "./client";
import {
	createAuthorizationCodeRequest,
	createAuthorizationURL,
} from "../../oauth2";
import { generateRandomString } from "../../crypto";
import type { MakeRequired } from "../../types/helper";

describe("oauth userinfo", async () => {
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

	const { headers, user } = await signInWithTestUser();
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
		expect(tokens.data?.access_token).toBeDefined();
		const userinfo = await client.oauth2.userinfo();
		expect(userinfo.error?.status).toBe(401);
	});

	it("should fail without the openid scope", async () => {
		const tokens = await getTokens({
			scopes: [],
		});
		expect(tokens.data?.access_token).toBeDefined();
		const userinfo = await client.$fetch<Record<string, string>>(
			"/oauth2/userinfo",
			{
				headers: {
					authorization: tokens.data?.access_token ?? "",
				},
			},
		);
		expect(userinfo.error?.status).toBe(400);
	});

	it("should pass provide all user information - opaque", async () => {
		const tokens = await getTokens();
		expect(tokens.data?.access_token).toBeDefined();
		const userinfo = await client.$fetch<Record<string, string>>(
			"/oauth2/userinfo",
			{
				headers: {
					authorization: tokens.data?.access_token ?? "",
				},
			},
		);
		expect(userinfo.data).toMatchObject({
			sub: user.id,
			name: user.name,
			given_name: expect.any(String),
			family_name: expect.any(String),
			email: user.email,
			email_verified: user.emailVerified,
		});
	});

	it("should pass provide all user information - jwt", async () => {
		const tokens = await getTokens(undefined, validAudience);
		expect(tokens.data?.access_token).toBeDefined();
		const userinfo = await client.$fetch<Record<string, string>>(
			"/oauth2/userinfo",
			{
				headers: {
					authorization: tokens.data?.access_token ?? "",
				},
			},
		);
		expect(userinfo.data).toMatchObject({
			sub: user.id,
			name: user.name,
			given_name: expect.any(String),
			family_name: expect.any(String),
			email: user.email,
			email_verified: user.emailVerified,
		});
	});

	it("should pass provide scoped user information - sub only", async () => {
		const tokens = await getTokens({
			scopes: ["openid"],
		});
		expect(tokens.data?.access_token).toBeDefined();
		const userinfo = await client.$fetch<Record<string, string>>(
			"/oauth2/userinfo",
			{
				headers: {
					authorization: tokens.data?.access_token ?? "",
				},
			},
		);
		expect(userinfo.data).toMatchObject({
			sub: user.id,
		});
		expect(userinfo.data?.name).toBeUndefined();
		expect(userinfo.data?.given_name).toBeUndefined();
		expect(userinfo.data?.family_name).toBeUndefined();
		expect(userinfo.data?.email).toBeUndefined();
		expect(userinfo.data?.email_verified).toBeUndefined();
	});

	it("should pass provide scoped user information - profile only", async () => {
		const tokens = await getTokens({
			scopes: ["openid", "profile"],
		});
		expect(tokens.data?.access_token).toBeDefined();
		const userinfo = await client.$fetch<Record<string, string>>(
			"/oauth2/userinfo",
			{
				headers: {
					authorization: tokens.data?.access_token ?? "",
				},
			},
		);
		expect(userinfo.data).toMatchObject({
			sub: user.id,
			name: user.name,
			given_name: expect.any(String),
			family_name: expect.any(String),
		});
		expect(userinfo.data?.email).toBeUndefined();
		expect(userinfo.data?.email_verified).toBeUndefined();
	});

	it("should pass provide scoped user information - email only", async () => {
		const tokens = await getTokens({
			scopes: ["openid", "email"],
		});
		expect(tokens.data?.access_token).toBeDefined();
		const userinfo = await client.$fetch<Record<string, string>>(
			"/oauth2/userinfo",
			{
				headers: {
					authorization: tokens.data?.access_token ?? "",
				},
			},
		);
		expect(userinfo.data).toMatchObject({
			sub: user.id,
			email: user.email,
			email_verified: user.emailVerified,
		});
		expect(userinfo.data?.name).toBeUndefined();
		expect(userinfo.data?.given_name).toBeUndefined();
		expect(userinfo.data?.family_name).toBeUndefined();
	});
});
