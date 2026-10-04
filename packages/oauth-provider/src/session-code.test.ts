import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthClient } from "./types/oauth";

const authServerBaseUrl = "http://localhost:3000";
const redirectUri = "http://localhost:5000/api/auth/callback/test";

async function issueRefreshToken(sessionCode: boolean | { expiresIn: number }) {
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
				sessionCode,
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
	const oauthClient = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			token_endpoint_auth_method: "client_secret_post",
			grant_types: ["authorization_code", "refresh_token"],
			redirect_uris: [redirectUri],
			application_type: "native",
			skip_consent: true,
		},
	});
	expect(oauthClient?.client_id).toBeDefined();
	expect(oauthClient?.client_secret).toBeDefined();

	const codeVerifier = generateRandomString(32);
	const authUrl = await createAuthorizationURL({
		id: "test",
		options: {
			clientId: oauthClient.client_id,
			clientSecret: oauthClient.client_secret,
			redirectURI: redirectUri,
		},
		redirectURI: "",
		authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
		state: "123",
		scopes: ["openid", "offline_access"],
		codeVerifier,
	});

	let callbackRedirectUrl = "";
	await client.$fetch(authUrl.toString(), {
		onError(context) {
			callbackRedirectUrl = context.response.headers.get("Location") || "";
		},
	});
	const code = new URL(callbackRedirectUrl).searchParams.get("code");
	expect(code).toBeTruthy();

	const { body, headers: tokenHeaders } = await authorizationCodeRequest({
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
		access_token?: string;
		refresh_token?: string;
	}>("/oauth2/token", {
		method: "POST",
		body,
		headers: tokenHeaders,
	});
	expect(tokens.data?.refresh_token).toBeTruthy();
	expect(tokens.data?.access_token).toBeTruthy();

	return {
		auth,
		client,
		refreshToken: tokens.data!.refresh_token!,
		accessToken: tokens.data!.access_token!,
		oauthClient: oauthClient as OAuthClient,
	};
}

describe("oauth session code", () => {
	it("mints a browser session from a refresh token and rejects a second use", async () => {
		const { client, refreshToken } = await issueRefreshToken(true);

		const created = await client.$fetch<{ code: string; expires_in: number }>(
			"/oauth2/session-code",
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${refreshToken}`,
				},
			},
		);
		expect(created.error).toBeNull();
		expect(created.data?.code).toBeTruthy();
		expect(created.data?.expires_in).toBe(180);

		const consumed = await client.$fetch<{ token: string }>(
			"/oauth2/session-code/consume",
			{
				method: "POST",
				body: { code: created.data!.code },
			},
		);
		expect(consumed.error).toBeNull();
		expect(consumed.data?.token).toBeTruthy();

		const replay = await client.$fetch("/oauth2/session-code/consume", {
			method: "POST",
			body: { code: created.data!.code },
		});
		expect(replay.data).toBeNull();
		expect(replay.error).toBeTruthy();
	});

	it("rejects an access token", async () => {
		const { client, accessToken } = await issueRefreshToken(true);
		const created = await client.$fetch("/oauth2/session-code", {
			method: "POST",
			headers: {
				authorization: `Bearer ${accessToken}`,
			},
		});
		expect(created.data).toBeNull();
		expect(created.error).toBeTruthy();
	});

	it("stays off until sessionCode is set", async () => {
		const { auth } = await getTestInstance({
			baseURL: authServerBaseUrl,
			plugins: [
				jwt({ jwt: { issuer: authServerBaseUrl } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
				}),
			],
		});
		await expect(
			auth.api.createOAuthSessionCode({
				headers: new Headers({ authorization: "Bearer anything" }),
			}),
		).rejects.toThrow();
	});
});
