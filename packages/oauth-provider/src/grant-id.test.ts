import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
	refreshAccessTokenRequest,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthOptions, Scope } from "./types";

const authServerBaseUrl = "http://localhost:3000";
const resource = "https://api.example.com";
const redirectUri = "http://localhost:5000/api/auth/oauth2/callback/test";
const formHeaders = {
	accept: "application/json",
	"content-type": "application/x-www-form-urlencoded",
};

type Callback =
	| "accessToken"
	| "idToken"
	| "tokenResponse"
	| "userInfo"
	| "extensionAccessToken"
	| "extensionIdToken"
	| "extensionUserInfo";

async function setup(providerOptions?: Partial<OAuthOptions<Scope[]>>) {
	const seen: { callback: Callback; grantId: string | undefined }[] = [];
	const record = (callback: Callback, grantId: string | undefined) => {
		seen.push({ callback, grantId });
		return {};
	};
	const { auth, client, signInWithTestUser } = await getTestInstance(
		{
			baseURL: authServerBaseUrl,
			plugins: [
				jwt({ jwt: { issuer: authServerBaseUrl } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					scopes: ["openid", "profile", "email", "offline_access", "read"],
					resources: [resource],
					enforcePerClientResources: false,
					clientPrivileges: () => true,
					customAccessTokenClaims: ({ grantId }) =>
						record("accessToken", grantId),
					customIdTokenClaims: ({ grantId }) => record("idToken", grantId),
					customUserInfoClaims: ({ grantId }) => record("userInfo", grantId),
					customTokenResponseFields: ({ grantId }) => ({
						...record("tokenResponse", grantId),
						seen_grant_id: grantId ?? null,
					}),
					extensions: [
						{
							claims: {
								accessToken: ({ grantId }) =>
									record("extensionAccessToken", grantId),
								idToken: ({ grantId }) => record("extensionIdToken", grantId),
								userInfo: ({ grantId }) => record("extensionUserInfo", grantId),
							},
						},
					],
					...providerOptions,
				}),
			],
		},
		{ clientOptions: { plugins: [oauthProviderClient()] } },
	);
	const { headers } = await signInWithTestUser();
	const oauthClient = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			redirect_uris: [redirectUri],
			application_type: "native",
			token_endpoint_auth_method: "client_secret_post",
			grant_types: [
				"authorization_code",
				"refresh_token",
				"client_credentials",
			],
			scope: "openid profile email offline_access read",
			client_credentials_scopes: ["read"],
			skip_consent: true,
		},
	});
	const options = {
		clientId: oauthClient.client_id,
		clientSecret: oauthClient.client_secret!,
		redirectURI: redirectUri,
	};
	const grantIdsSeen = (...callbacks: Callback[]) => {
		const ids = seen
			.filter((entry) => callbacks.includes(entry.callback))
			.map((entry) => entry.grantId);
		seen.length = 0;
		return ids;
	};
	return { auth, client, headers, options, grantIdsSeen };
}

type TestServer = Awaited<ReturnType<typeof setup>>;

interface TokenResponse {
	access_token: string;
	refresh_token?: string;
	id_token?: string;
	seen_grant_id: string | null;
}

async function authorize(
	{ client, headers, options }: TestServer,
	{ offline = false, jwtAccessToken = false } = {},
) {
	const codeVerifier = generateRandomString(32);
	const authUrl = await createAuthorizationURL({
		id: "test",
		options,
		redirectURI: "",
		authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
		state: "123",
		scopes: [
			"openid",
			"profile",
			"email",
			...(offline ? ["offline_access"] : []),
		],
		codeVerifier,
	});
	let callbackRedirectUrl = "";
	await client.$fetch(authUrl.toString(), {
		headers,
		onError(context) {
			callbackRedirectUrl = context.response.headers.get("Location") || "";
		},
	});
	const code = new URL(callbackRedirectUrl).searchParams.get("code")!;
	const { body, headers: tokenHeaders } = await authorizationCodeRequest({
		code,
		codeVerifier,
		redirectURI: redirectUri,
		...(jwtAccessToken ? { resource } : {}),
		options,
	});
	const tokens = (
		await client.$fetch<TokenResponse>("/oauth2/token", {
			method: "POST",
			body,
			headers: tokenHeaders,
		})
	).data!;
	expect(tokens.access_token.split(".")).toHaveLength(jwtAccessToken ? 3 : 1);
	return tokens;
}

async function refresh({ client, options }: TestServer, refreshToken: string) {
	const { body, headers } = await refreshAccessTokenRequest({
		refreshToken,
		options,
	});
	return (
		await client.$fetch<TokenResponse>("/oauth2/token", {
			method: "POST",
			body,
			headers,
		})
	).data!;
}

describe("oauth-provider - grant ID in claim and response callbacks", async () => {
	const server = await setup();

	it("gives two authorizations under one consent different grant IDs", async () => {
		const first = await authorize(server, { jwtAccessToken: true });
		const firstIds = server.grantIdsSeen(
			"accessToken",
			"idToken",
			"tokenResponse",
			"extensionAccessToken",
			"extensionIdToken",
		);
		const second = await authorize(server, { jwtAccessToken: true });
		const secondIds = server.grantIdsSeen(
			"accessToken",
			"idToken",
			"tokenResponse",
			"extensionAccessToken",
			"extensionIdToken",
		);

		expect(firstIds).toHaveLength(5);
		expect(new Set(firstIds)).toEqual(new Set([first.seen_grant_id]));
		expect(new Set(secondIds)).toEqual(new Set([second.seen_grant_id]));
		expect(first.seen_grant_id).toEqual(expect.any(String));
		expect(second.seen_grant_id).toEqual(expect.any(String));
		expect(first.seen_grant_id).not.toBe(second.seen_grant_id);
	});

	it("keeps the grant ID across refresh-token rotation", async () => {
		const issued = await authorize(server, { offline: true });
		const rotated = await refresh(server, issued.refresh_token!);
		server.grantIdsSeen();
		const rotatedAgain = await refresh(server, rotated.refresh_token!);

		expect(issued.seen_grant_id).toEqual(expect.any(String));
		expect(rotated.seen_grant_id).toBe(issued.seen_grant_id);
		expect(rotatedAgain.seen_grant_id).toBe(issued.seen_grant_id);
		expect(new Set(server.grantIdsSeen("accessToken", "idToken"))).toEqual(
			new Set([issued.seen_grant_id]),
		);
	});

	it("passes the issuance's grant ID when introspection re-derives opaque access-token claims", async () => {
		const tokens = await authorize(server);
		expect(tokens.refresh_token).toBeUndefined();
		server.grantIdsSeen();

		const introspection = await server.client.oauth2.introspect(
			{
				client_id: server.options.clientId,
				client_secret: server.options.clientSecret,
				token: tokens.access_token,
			},
			{ headers: formHeaders },
		);

		expect(introspection.data?.active).toBe(true);
		const ids = server.grantIdsSeen("accessToken", "extensionAccessToken");
		expect(ids).toEqual([tokens.seen_grant_id, tokens.seen_grant_id]);
	});

	it("passes the access token's grant ID to UserInfo claim callbacks", async () => {
		const tokens = await authorize(server, { offline: true });
		server.grantIdsSeen();

		const userInfo = await server.client.$fetch("/oauth2/userinfo", {
			headers: { authorization: `Bearer ${tokens.access_token}` },
		});

		expect(userInfo.error).toBeNull();
		expect(server.grantIdsSeen("userInfo", "extensionUserInfo")).toEqual([
			tokens.seen_grant_id,
			tokens.seen_grant_id,
		]);
	});

	it("passes no grant ID to a client credentials issuance", async () => {
		const response = await server.client.$fetch<TokenResponse>(
			"/oauth2/token",
			{
				method: "POST",
				headers: formHeaders,
				body: new URLSearchParams({
					grant_type: "client_credentials",
					scope: "read",
					client_id: server.options.clientId,
					client_secret: server.options.clientSecret,
				}),
			},
		);

		expect(response.error).toBeNull();
		expect(response.data?.seen_grant_id).toBeNull();
	});
});

describe("oauth-provider - grant ID with revocable JWT access tokens", async () => {
	const server = await setup({ revocableJwtAccessTokens: true });

	it("passes the JWT access token's grant ID to UserInfo claim callbacks", async () => {
		const tokens = await authorize(server, { jwtAccessToken: true });
		server.grantIdsSeen();

		const userInfo = await server.client.$fetch("/oauth2/userinfo", {
			headers: { authorization: `Bearer ${tokens.access_token}` },
		});

		expect(userInfo.error).toBeNull();
		expect(server.grantIdsSeen("userInfo", "extensionUserInfo")).toEqual([
			tokens.seen_grant_id,
			tokens.seen_grant_id,
		]);
	});
});
