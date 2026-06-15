import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
	deriveDpopAth,
	deriveDpopJkt,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { APIError } from "better-call";
import type { JWK } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthClient } from "./types/oauth";

type MakeRequired<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

const INVALID_ACCESS_TOKEN_CHALLENGE =
	'Bearer error="invalid_token", error_description="Invalid access token"';

describe("oauth userinfo", async () => {
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
	const redirectUri = `${rpBaseUrl}/api/auth/callback/${providerId}`;
	const state = "123";

	async function createAuthUrl(
		overrides?: Partial<Parameters<typeof createAuthorizationURL>[0]>,
	) {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}
		const codeVerifier = generateRandomString(32);
		const { url } = await createAuthorizationURL({
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
			Partial<Parameters<typeof authorizationCodeRequest>[0]>,
			"code"
		>,
		extraHeaders?: HeadersInit,
	) {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const { body, headers } = await authorizationCodeRequest({
			...overrides,
			redirectURI: redirectUri,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
			},
		});

		const tokenHeaders = new Headers(headers);
		if (extraHeaders) {
			for (const [key, value] of new Headers(extraHeaders)) {
				tokenHeaders.set(key, value);
			}
		}

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
			headers: tokenHeaders,
		});

		return tokens;
	}

	async function createDpopKey() {
		const { privateKey, publicKey } = await generateKeyPair("ES256", {
			extractable: true,
		});
		const publicJwk = await exportJWK(publicKey);
		const jkt = await deriveDpopJkt(publicJwk);
		return { privateKey, publicJwk, jkt };
	}

	async function createDpopProof(params: {
		privateKey: CryptoKey;
		publicJwk: JWK;
		method: string;
		url: string;
		jti: string;
		accessToken?: string;
	}) {
		return new SignJWT({
			jti: params.jti,
			htm: params.method,
			htu: params.url,
			iat: Math.floor(Date.now() / 1000),
			...(params.accessToken
				? { ath: await deriveDpopAth(params.accessToken) }
				: {}),
		})
			.setProtectedHeader({
				typ: "dpop+jwt",
				alg: "ES256",
				jwk: params.publicJwk,
			})
			.sign(params.privateKey);
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
	});

	it("should fail unauthenticated request", async () => {
		const tokens = await getTokens();
		expect(tokens.data?.access_token).toBeDefined();
		const userinfo = await client.oauth2.userinfo();
		expect(userinfo.error?.status).toBe(401);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9949
	 */
	it("should return an invalid_token challenge for an unknown bearer token", async () => {
		let wwwAuthenticate = "";
		const userinfo = await client.$fetch<Record<string, string>>(
			"/oauth2/userinfo",
			{
				headers: {
					authorization: "Bearer this-is-not-a-valid-access-token",
				},
				onError(context) {
					wwwAuthenticate =
						context.response.headers.get("WWW-Authenticate") ?? "";
				},
			},
		);

		expect(userinfo.error?.status).toBe(401);
		expect(
			(userinfo.error as { error?: string; error_description?: string }).error,
		).toBe("invalid_token");
		expect(wwwAuthenticate).toBe(INVALID_ACCESS_TOKEN_CHALLENGE);
	});

	it("should fail without the openid scope", async () => {
		const tokens = await getTokens({
			scopes: ["profile"],
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

	it("rejects a revoked access token with invalid_token (401), not invalid_scope", async () => {
		const tokens = await getTokens();
		expect(tokens.data?.access_token).toBeDefined();

		const ctx = await auth.$context;
		const session = await auth.api.getSession({ headers });
		await ctx.adapter.updateMany({
			model: "oauthAccessToken",
			where: [{ field: "sessionId", value: session!.session.id }],
			update: { revoked: new Date() },
		});

		try {
			await auth.api.oauth2UserInfo({
				headers: new Headers({
					Authorization: `Bearer ${tokens.data!.access_token!}`,
				}),
			});
			expect.unreachable();
		} catch (error) {
			const err = error as APIError;
			const headers = new Headers(err.headers);
			expect(err.statusCode).toBe(401);
			expect(err.body).toMatchObject({ error: "invalid_token" });
			expect(headers.get("WWW-Authenticate")).toBe(
				INVALID_ACCESS_TOKEN_CHALLENGE,
			);
		}
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

	it("should accept POST with the bearer token in the Authorization header", async () => {
		const tokens = await getTokens();
		expect(tokens.data?.access_token).toBeDefined();
		const userinfo = await client.$fetch<Record<string, string>>(
			"/oauth2/userinfo",
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${tokens.data?.access_token ?? ""}`,
				},
			},
		);
		expect(userinfo.data).toMatchObject({ sub: user.id });
	});

	/**
	 * Programmatic callers have no `ctx.request`, so userinfo must resolve the
	 * bearer token from `ctx.headers` for both transports.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/8806
	 */
	it("should return userinfo via auth.api with headers only (no Request)", async () => {
		const tokens = await getTokens();
		expect(tokens.data?.access_token).toBeDefined();
		const userinfo = await auth.api.oauth2UserInfo({
			headers: new Headers({
				Authorization: `Bearer ${tokens.data!.access_token!}`,
			}),
		});
		expect(userinfo).toMatchObject({
			sub: user.id,
			name: user.name,
			given_name: expect.any(String),
			family_name: expect.any(String),
			email: user.email,
			email_verified: user.emailVerified,
		});
	});

	it("should reject auth.api userinfo when Authorization header is missing", async () => {
		try {
			await auth.api.oauth2UserInfo({ headers: new Headers() });
			expect.unreachable();
		} catch (error) {
			const err = error as APIError;
			expect(err.statusCode).toBe(401);
			expect(err.body).toMatchObject({
				error: "invalid_request",
				error_description: "authorization header not found",
			});
		}
	});

	it("should pass provide all user information - jwt", async () => {
		const tokens = await getTokens(undefined, validResource);
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

	it("enforces DPoP proof for DPoP-bound userinfo access", async () => {
		const dpopKey = await createDpopKey();
		const { url: authUrl, codeVerifier } = await createAuthUrl({
			additionalParams: { dpop_jkt: dpopKey.jkt },
		});
		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		const callbackUrl = new URL(callbackRedirectUrl);
		const tokenDpopProof = await createDpopProof({
			privateKey: dpopKey.privateKey,
			publicJwk: dpopKey.publicJwk,
			method: "POST",
			url: `${authServerBaseUrl}/api/auth/oauth2/token`,
			jti: "token-proof",
		});
		const tokens = await validateAuthCode(
			{
				code: callbackUrl.searchParams.get("code")!,
				codeVerifier,
				resource: validResource,
			},
			{ DPoP: tokenDpopProof },
		);
		expect(tokens.data?.token_type).toBe("DPoP");
		expect(tokens.data?.access_token).toBeDefined();

		const bearerUserinfo = await client.$fetch<Record<string, string>>(
			"/oauth2/userinfo",
			{
				headers: {
					authorization: `Bearer ${tokens.data?.access_token ?? ""}`,
				},
			},
		);
		expect(bearerUserinfo.error?.status).toBe(401);

		const userinfoDpopProof = await createDpopProof({
			privateKey: dpopKey.privateKey,
			publicJwk: dpopKey.publicJwk,
			method: "GET",
			url: `${authServerBaseUrl}/api/auth/oauth2/userinfo`,
			jti: "userinfo-proof",
			accessToken: tokens.data?.access_token,
		});
		const userinfo = await client.$fetch<Record<string, string>>(
			"/oauth2/userinfo",
			{
				headers: {
					authorization: `DPoP ${tokens.data?.access_token ?? ""}`,
					DPoP: userinfoDpopProof,
				},
			},
		);

		expect(userinfo.data).toMatchObject({
			sub: user.id,
			name: user.name,
			email: user.email,
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
