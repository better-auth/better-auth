import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
	DPOP_SIGNING_ALGORITHMS,
	deriveDpopAth,
	deriveDpopJkt,
	refreshAccessTokenRequest,
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
		baseURL: `${authServerBaseUrl}/api/auth/`,
		advanced: { skipTrailingSlashes: true },
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

	async function refreshAccessToken(refreshToken: string) {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}
		const { body, headers } = await refreshAccessTokenRequest({
			refreshToken,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
			},
		});
		return client.$fetch<{
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
			body,
			headers,
		});
	}

	// Registers a confidential client application to work with
	beforeAll(async () => {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
				token_endpoint_auth_method: "client_secret_post",
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

	it("should accept POST with the bearer token in the form body", async () => {
		const tokens = await getTokens();
		expect(tokens.data?.access_token).toBeDefined();
		const userinfo = await client.$fetch<Record<string, string>>(
			"/oauth2/userinfo",
			{
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					access_token: tokens.data?.access_token ?? "",
				}),
			},
		);
		expect(userinfo.data).toMatchObject({ sub: user.id });
	});

	it("should reject UserInfo requests with bearer tokens in both header and body", async () => {
		const tokens = await getTokens();
		expect(tokens.data?.access_token).toBeDefined();
		const userinfo = await client.$fetch<Record<string, string>>(
			"/oauth2/userinfo",
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${tokens.data?.access_token ?? ""}`,
					"content-type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					access_token: tokens.data?.access_token ?? "",
				}),
			},
		);

		expect(userinfo.error?.status).toBe(400);
		expect(
			(userinfo.error as { error?: string } | null | undefined)?.error,
		).toBe("invalid_request");
		expect(
			(userinfo.error as { error_description?: string } | null | undefined)
				?.error_description,
		).toBe("Multiple access token transport methods are not allowed");
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
				error_description: "access token not found",
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

		const bodyTokenUserinfo = await client.$fetch<Record<string, string>>(
			"/oauth2/userinfo",
			{
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					access_token: tokens.data?.access_token ?? "",
				}),
			},
		);
		expect(bodyTokenUserinfo.error?.status).toBe(401);
		expect(
			(
				bodyTokenUserinfo.error as {
					error?: string;
					error_description?: string;
				} | null
			)?.error,
		).toBe("invalid_token");
		expect(
			(
				bodyTokenUserinfo.error as {
					error?: string;
					error_description?: string;
				} | null
			)?.error_description,
		).toBe("DPoP-bound access token requires the DPoP authorization scheme");

		const userinfoDpopProof = await createDpopProof({
			privateKey: dpopKey.privateKey,
			publicJwk: dpopKey.publicJwk,
			method: "GET",
			url: `${authServerBaseUrl}/api/auth/oauth2/userinfo`,
			jti: "userinfo-proof",
			accessToken: tokens.data?.access_token,
		});
		const response = await customFetchImpl(
			"http://auth-service:3000/api/auth/oauth2/userinfo",
			{
				headers: {
					authorization: `DPoP ${tokens.data?.access_token ?? ""}`,
					DPoP: userinfoDpopProof,
				},
			},
		);
		const userinfo: Record<string, string> = await response.json();

		expect(response.status).toBe(200);
		expect(userinfo).toMatchObject({
			sub: user.id,
			name: user.name,
			email: user.email,
		});
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc9449#section-4.3
	 */
	it("keeps the trailing slash of a DPoP userinfo request when skipTrailingSlashes is on", async () => {
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
		const tokens = await validateAuthCode(
			{
				code: new URL(callbackRedirectUrl).searchParams.get("code")!,
				codeVerifier,
				resource: validResource,
			},
			{
				DPoP: await createDpopProof({
					privateKey: dpopKey.privateKey,
					publicJwk: dpopKey.publicJwk,
					method: "POST",
					url: `${authServerBaseUrl}/api/auth/oauth2/token`,
					jti: "trailing-slash-token-proof",
				}),
			},
		);
		const accessToken = tokens.data?.access_token ?? "";
		const userinfoUrl = `${authServerBaseUrl}/api/auth/oauth2/userinfo/`;
		const response = await customFetchImpl(userinfoUrl, {
			headers: {
				authorization: `DPoP ${accessToken}`,
				DPoP: await createDpopProof({
					privateKey: dpopKey.privateKey,
					publicJwk: dpopKey.publicJwk,
					method: "GET",
					url: userinfoUrl,
					jti: "trailing-slash-userinfo-proof",
					accessToken,
				}),
			},
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ sub: user.id });
	});

	/**
	 * Every 401 carries a challenge (RFC 7235 §3.1). A DPoP-bound token, or a
	 * request that used the DPoP scheme, is challenged with `DPoP` and the
	 * accepted proof algorithms; everything else with `Bearer`.
	 *
	 * @see https://datatracker.ietf.org/doc/html/rfc9449#section-7.1
	 * @see https://datatracker.ietf.org/doc/html/rfc6750#section-3
	 */
	describe("WWW-Authenticate challenges", () => {
		const userinfoUrl = `${authServerBaseUrl}/api/auth/oauth2/userinfo`;
		const algs = DPOP_SIGNING_ALGORITHMS.join(" ");
		const dpopChallenge = (error: string, description: string) =>
			`DPoP error="${error}", error_description="${description}", algs="${algs}"`;

		async function getDpopBoundToken() {
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
			const tokens = await validateAuthCode(
				{
					code: new URL(callbackRedirectUrl).searchParams.get("code")!,
					codeVerifier,
					resource: validResource,
				},
				{
					DPoP: await createDpopProof({
						privateKey: dpopKey.privateKey,
						publicJwk: dpopKey.publicJwk,
						method: "POST",
						url: `${authServerBaseUrl}/api/auth/oauth2/token`,
						jti: crypto.randomUUID(),
					}),
				},
			);
			expect(tokens.data?.token_type).toBe("DPoP");
			return { dpopKey, accessToken: tokens.data!.access_token! };
		}

		async function requestUserinfo(init: RequestInit) {
			const response = await customFetchImpl(userinfoUrl, init);
			return {
				status: response.status,
				challenge: response.headers.get("WWW-Authenticate"),
				exposed: response.headers.get("Access-Control-Expose-Headers"),
			};
		}

		it("offers both schemes without an error code when no token is sent", async () => {
			const result = await requestUserinfo({});

			expect(result.status).toBe(401);
			expect(result.challenge).toBe(`Bearer, DPoP algs="${algs}"`);
			expect(result.exposed).toBe("WWW-Authenticate");
		});

		it("carries the no-token challenge on an auth.api error", async () => {
			const error = await auth.api
				.oauth2UserInfo({ headers: new Headers() })
				.catch((error: APIError) => error);

			expect((error as APIError).statusCode).toBe(401);
			expect(
				new Headers((error as APIError).headers).get("WWW-Authenticate"),
			).toBe(`Bearer, DPoP algs="${algs}"`);
		});

		it("keeps the Bearer challenge for an invalid token sent with the Bearer scheme", async () => {
			const result = await requestUserinfo({
				headers: { authorization: "Bearer this-is-not-a-valid-access-token" },
			});

			expect(result.status).toBe(401);
			expect(result.challenge).toBe(INVALID_ACCESS_TOKEN_CHALLENGE);
			expect(result.exposed).toBe("WWW-Authenticate");
		});

		it("challenges with DPoP for an invalid token sent with the DPoP scheme", async () => {
			const result = await requestUserinfo({
				headers: { authorization: "DPoP this-is-not-a-valid-access-token" },
			});

			expect(result.status).toBe(401);
			expect(result.challenge).toBe(
				dpopChallenge("invalid_token", "Invalid access token"),
			);
		});

		it("challenges with DPoP when a DPoP-bound token is sent with the Bearer scheme", async () => {
			const { accessToken } = await getDpopBoundToken();
			const result = await requestUserinfo({
				headers: { authorization: `Bearer ${accessToken}` },
			});

			expect(result.status).toBe(401);
			expect(result.challenge).toBe(
				dpopChallenge(
					"invalid_token",
					"DPoP-bound access token requires the DPoP authorization scheme",
				),
			);
			expect(result.exposed).toBe("WWW-Authenticate");
		});

		it("challenges with DPoP when a DPoP-bound token is sent in the form body", async () => {
			const { accessToken } = await getDpopBoundToken();
			const result = await requestUserinfo({
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({ access_token: accessToken }),
			});

			expect(result.status).toBe(401);
			expect(result.challenge).toBe(
				dpopChallenge(
					"invalid_token",
					"DPoP-bound access token requires the DPoP authorization scheme",
				),
			);
		});

		it("challenges with DPoP when the DPoP scheme carries a token that is not DPoP-bound", async () => {
			const tokens = await getTokens();
			const result = await requestUserinfo({
				headers: { authorization: `DPoP ${tokens.data!.access_token!}` },
			});

			expect(result.status).toBe(401);
			expect(result.challenge).toBe(
				dpopChallenge(
					"invalid_token",
					"DPoP authorization requires a DPoP-bound access token",
				),
			);
		});

		it("challenges with invalid_dpop_proof when the proof is missing", async () => {
			const { accessToken } = await getDpopBoundToken();
			const result = await requestUserinfo({
				headers: { authorization: `DPoP ${accessToken}` },
			});

			expect(result.status).toBe(401);
			expect(result.challenge).toBe(
				dpopChallenge("invalid_dpop_proof", "DPoP proof header is required"),
			);
			expect(result.exposed).toBe("WWW-Authenticate");
		});

		it("challenges with invalid_dpop_proof when the proof is not a JWT", async () => {
			const { accessToken } = await getDpopBoundToken();
			const result = await requestUserinfo({
				headers: { authorization: `DPoP ${accessToken}`, DPoP: "not-a-jwt" },
			});

			expect(result.status).toBe(401);
			expect(result.challenge).toBe(
				dpopChallenge("invalid_dpop_proof", "DPoP proof must be a compact JWT"),
			);
		});

		it("challenges with invalid_dpop_proof when the proof htu does not match", async () => {
			const { dpopKey, accessToken } = await getDpopBoundToken();
			const result = await requestUserinfo({
				headers: {
					authorization: `DPoP ${accessToken}`,
					DPoP: await createDpopProof({
						privateKey: dpopKey.privateKey,
						publicJwk: dpopKey.publicJwk,
						method: "GET",
						url: `${authServerBaseUrl}/api/auth/oauth2/introspect`,
						jti: crypto.randomUUID(),
						accessToken,
					}),
				},
			});

			expect(result.status).toBe(401);
			expect(result.challenge).toBe(
				dpopChallenge(
					"invalid_dpop_proof",
					"DPoP proof htu does not match the request URL",
				),
			);
		});

		it("challenges with invalid_dpop_proof when the proof htm does not match", async () => {
			const { dpopKey, accessToken } = await getDpopBoundToken();
			const result = await requestUserinfo({
				headers: {
					authorization: `DPoP ${accessToken}`,
					DPoP: await createDpopProof({
						privateKey: dpopKey.privateKey,
						publicJwk: dpopKey.publicJwk,
						method: "POST",
						url: userinfoUrl,
						jti: crypto.randomUUID(),
						accessToken,
					}),
				},
			});

			expect(result.status).toBe(401);
			expect(result.challenge).toBe(
				dpopChallenge(
					"invalid_dpop_proof",
					"DPoP proof htm does not match the request method",
				),
			);
		});

		it("challenges with invalid_dpop_proof when the proof is signed by another key", async () => {
			const { accessToken } = await getDpopBoundToken();
			const otherKey = await createDpopKey();
			const result = await requestUserinfo({
				headers: {
					authorization: `DPoP ${accessToken}`,
					DPoP: await createDpopProof({
						privateKey: otherKey.privateKey,
						publicJwk: otherKey.publicJwk,
						method: "GET",
						url: userinfoUrl,
						jti: crypto.randomUUID(),
						accessToken,
					}),
				},
			});

			expect(result.status).toBe(401);
			expect(result.challenge).toBe(
				dpopChallenge(
					"invalid_dpop_proof",
					"DPoP proof key does not match the bound token",
				),
			);
		});

		it("carries a DPoP challenge on an auth.api error for a DPoP-bound token", async () => {
			const { accessToken } = await getDpopBoundToken();
			const error = await auth.api
				.oauth2UserInfo({
					headers: new Headers({ authorization: `DPoP ${accessToken}` }),
				})
				.catch((error: APIError) => error);

			expect((error as APIError).statusCode).toBe(401);
			expect(
				new Headers((error as APIError).headers).get("WWW-Authenticate"),
			).toBe(
				dpopChallenge(
					"invalid_token",
					"DPoP-bound access token requires an HTTP request context",
				),
			);
		});

		it("sends no challenge on a successful Bearer request", async () => {
			const tokens = await getTokens();
			const result = await requestUserinfo({
				headers: { authorization: `Bearer ${tokens.data!.access_token!}` },
			});

			expect(result.status).toBe(200);
			expect(result.challenge).toBeNull();
		});

		/**
		 * The message `DPoP proof typ must be "dpop+jwt"` contains quotes, which
		 * RFC 6750 §3 does not allow in `error_description`. The challenge carries
		 * them as single quotes instead of failing the request with 500.
		 *
		 * @see https://datatracker.ietf.org/doc/html/rfc6750#section-3
		 */
		it("challenges with invalid_dpop_proof when the proof message contains quotes", async () => {
			const { dpopKey, accessToken } = await getDpopBoundToken();
			const proof = await new SignJWT({
				jti: crypto.randomUUID(),
				htm: "GET",
				htu: userinfoUrl,
				iat: Math.floor(Date.now() / 1000),
				ath: await deriveDpopAth(accessToken),
			})
				.setProtectedHeader({
					typ: "JWT",
					alg: "ES256",
					jwk: dpopKey.publicJwk,
				})
				.sign(dpopKey.privateKey);
			const result = await requestUserinfo({
				headers: { authorization: `DPoP ${accessToken}`, DPoP: proof },
			});

			expect(result.status).toBe(401);
			expect(result.challenge).toBe(
				dpopChallenge(
					"invalid_dpop_proof",
					"DPoP proof typ must be 'dpop+jwt'",
				),
			);
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

	it("returns explicitly requested UserInfo claims without granting the full scope bundle", async () => {
		const tokens = await getTokens({
			scopes: ["openid"],
			additionalParams: {
				claims: JSON.stringify({
					userinfo: {
						name: { essential: true },
						email: null,
					},
				}),
			},
		});
		expect(tokens.data?.access_token).toBeDefined();
		const accessToken = tokens.data?.access_token;
		const userinfo = await client.$fetch<Record<string, string>>(
			"/oauth2/userinfo",
			{
				headers: {
					authorization: accessToken ?? "",
				},
			},
		);

		expect(userinfo.data).toMatchObject({
			sub: user.id,
			name: user.name,
			email: user.email,
		});
		expect(userinfo.data?.given_name).toBeUndefined();
		expect(userinfo.data?.family_name).toBeUndefined();
		expect(userinfo.data?.email_verified).toBeUndefined();

		const introspection = await client.oauth2.introspect(
			{
				client_id: oauthClient?.client_id,
				client_secret: oauthClient?.client_secret,
				token: accessToken!,
				token_type_hint: "access_token",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(introspection.data?.active).toBe(true);
		// Requested UserInfo claims resolve only at /userinfo; they never surface
		// in the RFC 7662 introspection response shown to a resource server.
		const introspectionClaims = introspection.data as
			| Record<string, unknown>
			| undefined;
		expect(introspectionClaims?.name).toBeUndefined();
		expect(introspectionClaims?.email).toBeUndefined();
	});

	it("preserves requested UserInfo claims across refresh-token rotation", async () => {
		const tokens = await getTokens({
			scopes: ["openid", "offline_access"],
			additionalParams: {
				claims: JSON.stringify({
					userinfo: {
						name: { essential: true },
					},
				}),
			},
		});
		expect(tokens.data?.refresh_token).toBeDefined();

		const refreshedTokens = await refreshAccessToken(
			tokens.data?.refresh_token ?? "",
		);
		expect(refreshedTokens.data?.access_token).toBeDefined();
		const userinfo = await client.$fetch<Record<string, string>>(
			"/oauth2/userinfo",
			{
				headers: {
					authorization: refreshedTokens.data?.access_token ?? "",
				},
			},
		);

		expect(userinfo.data).toMatchObject({
			sub: user.id,
			name: user.name,
		});
		expect(userinfo.data?.given_name).toBeUndefined();
		expect(userinfo.data?.email).toBeUndefined();
	});

	it("resolves JWT access-token UserInfo claims by scope, omitting individually requested claims", async () => {
		const tokens = await getTokens(
			{
				scopes: ["openid"],
				additionalParams: {
					claims: JSON.stringify({
						userinfo: {
							name: { essential: true },
						},
					}),
				},
			},
			validResource,
		);
		expect(tokens.data?.access_token).toBeDefined();
		const userinfo = await client.$fetch<Record<string, string>>(
			"/oauth2/userinfo",
			{
				headers: {
					authorization: tokens.data?.access_token ?? "",
				},
			},
		);

		// A JWT access token has no per-issuance row, so a claim requested through
		// `claims.userinfo` without its backing scope is omitted (OIDC Core
		// §5.5.1). UserInfo claims for a JWT token come from granted scopes only.
		expect(userinfo.data).toMatchObject({ sub: user.id });
		expect(userinfo.data?.name).toBeUndefined();
		expect(userinfo.data?.email).toBeUndefined();
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

describe("oauth userinfo - unresolved baseURL", async () => {
	const { auth } = await getTestInstance({
		baseURL: "",
		plugins: [
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				disableJwtPlugin: true,
				scopes: ["openid", "read:posts"],
				clientPrivileges: () => true,
			}),
		],
	});

	/**
	 * Without a static `baseURL` or an HTTP request, `context.baseURL` stays
	 * empty; a headers-only call must still reach the normal token checks.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/8806
	 */
	it("evaluates a headers-only call without a configured baseURL", async () => {
		const { token } = await auth.api.signInEmail({
			body: { email: "test@test.com", password: "test123456" },
		});
		const client = await auth.api.adminCreateOAuthClient({
			headers: new Headers({ authorization: `Bearer ${token}` }),
			body: {
				token_endpoint_auth_method: "client_secret_post",
				grant_types: ["client_credentials"],
				client_credentials_scopes: ["read:posts"],
			},
		});
		const tokens = await auth.api.oauth2Token({
			body: {
				grant_type: "client_credentials",
				client_id: client.client_id,
				client_secret: client.client_secret,
				scope: "read:posts",
			},
		});

		await expect(
			auth.api.oauth2UserInfo({
				headers: new Headers({
					authorization: `Bearer ${tokens.access_token}`,
				}),
			}),
		).rejects.toMatchObject({
			statusCode: 400,
			body: { error: "invalid_scope" },
		});
	});
});
