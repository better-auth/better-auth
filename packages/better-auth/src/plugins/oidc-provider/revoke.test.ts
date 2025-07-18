import { beforeAll, describe, it, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { jwt } from "../jwt";
import { oidcProvider } from ".";
import { createAuthClient } from "../../client";
import type { OauthClient } from "..";
import { oidcClient } from "./client";
import {
	createAuthorizationCodeRequest,
	createAuthorizationURL,
} from "../../oauth2";
import { generateRandomString } from "../../crypto";
import type { MakeRequired } from "../../types/helper";

describe("oidc revoke", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const validAudience = "https://myapi.example.com";
	const { auth, signInWithTestUser, testUser, customFetchImpl } =
		await getTestInstance({
			baseURL: authServerBaseUrl,
			plugins: [
				jwt({
					usesOidcProviderPlugin: true,
					jwt: {
						audience: validAudience,
						issuer: authServerBaseUrl,
					},
				}),
				oidcProvider({
					loginPage: "/login",
					consentPage: "/consent",
					allowDynamicClientRegistration: true,
				}),
			],
		});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oidcClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: {
			customFetchImpl,
			headers,
		},
	});

	let oauthClient: OauthClient | null;

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
			expires_at?: string;
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
		// This test is performed in register.test.ts
		const application: Partial<OauthClient> = {
			redirect_uris: [redirectUri],
		};
		const response = await client.$fetch<OauthClient>("/oauth2/register", {
			method: "POST",
			body: application,
		});
		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.user_id).toBeDefined();
		expect(response.data?.client_secret).toBeDefined();
		expect(response.data?.redirect_uris).toEqual(application.redirect_uris);
		oauthClient = response.data;
	});

	it("should fail unauthenticated request", async () => {
		const tokens = await getTokens();
		const revocation = await client.$fetch("/oauth2/revoke", {
			method: "POST",
			body: {
				token: tokens.data?.access_token,
			},
		});
		expect(revocation.error?.status).toBe(401);
	});

	it("should pass verification with token_type_hint access_token and sent jwt access_token", async () => {
		const tokens = await getTokens(undefined, validAudience);
		const revocation = await client.$fetch("/oauth2/revoke", {
			method: "POST",
			body: {
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: tokens.data?.access_token,
				token_type_hint: "access_token",
			},
		});
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);
	});

	it("should pass verification with token_type_hint access_token and sent opaque access_token", async () => {
		const tokens = await getTokens();
		const revocation = await client.$fetch("/oauth2/revoke", {
			method: "POST",
			body: {
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: tokens.data?.access_token,
				token_type_hint: "access_token",
			},
		});
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);
	});

	it("should fail with token_type_hint access_token and sent refresh_token", async () => {
		const tokens = await getTokens();
		const revocation = await client.$fetch("/oauth2/revoke", {
			method: "POST",
			body: {
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: tokens.data?.refresh_token,
				token_type_hint: "access_token",
			},
		});
		expect(revocation.error?.status).toBe(400);
	});

	it("should pass verification with token_type_hint refresh_token and sent refresh_token", async () => {
		const tokens = await getTokens();
		const revocation = await client.$fetch("/oauth2/revoke", {
			method: "POST",
			body: {
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: tokens.data?.refresh_token,
				token_type_hint: "refresh_token",
			},
		});
		console.log(revocation);
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);
	});

	it("should fail verification with token_type_hint refresh_token and sent access_token", async () => {
		const tokens = await getTokens();
		const revocation = await client.$fetch("/oauth2/revoke", {
			method: "POST",
			body: {
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: tokens.data?.access_token,
				token_type_hint: "refresh_token",
			},
		});
		expect(revocation.error?.status).toBe(400);
	});

	it("should pass verification without token_type_hint and sent jwt access_token", async () => {
		const tokens = await getTokens(undefined, validAudience);
		const revocation = await client.$fetch("/oauth2/revoke", {
			method: "POST",
			body: {
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: tokens.data?.access_token,
			},
		});
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);
	});

	it("should pass verification without token_type_hint and sent opaque access_token", async () => {
		const tokens = await getTokens();
		const revocation = await client.$fetch("/oauth2/revoke", {
			method: "POST",
			body: {
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: tokens.data?.access_token,
			},
		});
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);
	});

	it("should pass verification without token_type_hint and sent refresh_token", async () => {
		const tokens = await getTokens();
		const revocation = await client.$fetch("/oauth2/revoke", {
			method: "POST",
			body: {
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: tokens.data?.refresh_token,
			},
		});
		expect(revocation.data).toBe(null);
		expect(revocation.error).toBe(null);
	});
});
