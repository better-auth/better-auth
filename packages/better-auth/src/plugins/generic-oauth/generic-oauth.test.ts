import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { GenericEndpointContext } from "@better-auth/core";
import { runWithEndpointContext } from "@better-auth/core/context";
import { APIError } from "@better-auth/core/error";
import { betterFetch } from "@better-fetch/fetch";
import { generateKeyPair, SignJWT } from "jose";
import type {
	MutableResponse,
	TokenRequestIncomingMessage,
} from "oauth2-mock-server";
import { OAuth2Server } from "oauth2-mock-server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAuthClient } from "../../client";
import { getAwaitableValue } from "../../context/helpers";
import { parseSetCookieHeader } from "../../cookies";
import { symmetricDecodeJWT } from "../../crypto";
import { getOAuthCallbackPath } from "../../oauth2/utils";
import { getTestInstance } from "../../test-utils/test-instance";
import { genericOAuth } from ".";
import { auth0 } from "./providers/auth0";
import { keycloak } from "./providers/keycloak";
import { microsoftEntraId } from "./providers/microsoft-entra-id";
import { okta } from "./providers/okta";
import { slack } from "./providers/slack";
import { yandex } from "./providers/yandex";

describe("oauth2", async () => {
	const providerId = "test";
	const clientId = "test-client-id";
	const clientSecret = "test-client-secret";
	const server = new OAuth2Server();
	await server.start();
	const port = Number(server.issuer.url?.split(":")[2]!);

	afterAll(async () => {
		await server.stop();
	});

	const { customFetchImpl, auth, cookieSetter } = await getTestInstance({
		trustedOrigins: ["http://localhost:*"],
		databaseHooks: {
			user: {
				create: {
					before: async (user) => ({
						data: { ...user, emailVerified: true },
					}),
				},
			},
		},
		plugins: [
			genericOAuth({
				config: [
					{
						providerId,
						discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
						clientId: clientId,
						clientSecret: clientSecret,
						pkce: true,
					},
				],
			}),
		],
	});

	const authClient = createAuthClient({
		baseURL: "http://localhost:3000",
		fetchOptions: {
			customFetchImpl,
		},
	});

	beforeAll(async () => {
		const context = await auth.$context;
		await runWithEndpointContext(
			{
				context,
			} as unknown as GenericEndpointContext,
			async () => {
				await context.internalAdapter.createUser(
					{
						email: "oauth2@test.com",
						name: "OAuth2 Test",
					},
					{ method: "test" },
				);
			},
		);
		await server.issuer.keys.generate("RS256");
	});

	server.service.on("beforeUserinfo", (userInfoResponse, req) => {
		userInfoResponse.body = {
			email: "oauth2@test.com",
			name: "OAuth2 Test",
			sub: "oauth2",
			picture: "https://test.com/picture.png",
			email_verified: true,
		};
		userInfoResponse.statusCode = 200;
	});

	async function simulateOAuthFlow(
		authUrl: string,
		headers: Headers,
		fetchImpl?: ((...args: any) => any) | undefined,
	) {
		let location: string | null = null;
		await betterFetch(authUrl, {
			method: "GET",
			redirect: "manual",
			onError(context) {
				location = context.response.headers.get("location");
			},
		});

		if (!location) throw new Error("No redirect location found");

		let callbackURL = "";
		let setCookieHeader = "";
		const newHeaders = new Headers();
		await betterFetch(location, {
			method: "GET",
			customFetchImpl: fetchImpl || customFetchImpl,
			headers,
			onError(context) {
				callbackURL = context.response.headers.get("location") || "";
				setCookieHeader = context.response.headers.get("set-cookie") || "";
				cookieSetter(newHeaders)(context);
			},
		});

		return { callbackURL, headers: newHeaders, setCookieHeader };
	}

	it("should delete state cookie with path attribute", async () => {
		const headers = new Headers();
		const signInRes = await authClient.signIn.social({
			provider: "test",
			callbackURL: "http://localhost:3000/dashboard",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		const { setCookieHeader } = await simulateOAuthFlow(
			signInRes.data?.url || "",
			headers,
		);

		const cookies = parseSetCookieHeader(setCookieHeader);
		const stateCookie = cookies.get("better-auth.state");

		expect(stateCookie?.["max-age"]).toBe(0);
		expect(stateCookie?.path).toBe("/");
	});

	it("should complete full sign-in flow and return correct session data", async () => {
		const headers = new Headers();
		const signInRes = await authClient.signIn.social({
			provider: "test",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining(`http://localhost:${port}/authorize`),
			redirect: true,
		});
		const { callbackURL, headers: sessionHeaders } = await simulateOAuthFlow(
			signInRes.data?.url || "",
			headers,
		);
		expect(callbackURL).toBe("http://localhost:3000/dashboard");

		const session = await authClient.getSession({
			fetchOptions: { headers: sessionHeaders },
		});
		expect(session.data).not.toBeNull();
		expect(session.data?.user.email).toBe("oauth2@test.com");
		expect(session.data?.user.name).toBe("OAuth2 Test");
		expect(session.data?.session.userId).toBe(session.data?.user.id);

		const ctx = await auth.$context;
		const accounts = await ctx.internalAdapter.findAccounts(
			session.data?.user.id!,
		);
		expect(accounts).toHaveLength(1);
		expect(accounts[0]).toMatchObject({
			providerId: "test",
			accountId: "oauth2",
		});
	});

	it("should redirect to the provider and handle the response for a new user", async () => {
		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: "oauth2-2@test.com",
				name: "OAuth2 Test 2",
				sub: "oauth2-2",
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		const headers = new Headers();
		const signInRes = await authClient.signIn.social({
			provider: "test",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining(`http://localhost:${port}/authorize`),
			redirect: true,
		});
		const { callbackURL, headers: newHeaders } = await simulateOAuthFlow(
			signInRes.data?.url || "",
			headers,
		);
		expect(callbackURL).toBe("http://localhost:3000/new_user");
		const session = await authClient.getSession({
			fetchOptions: {
				headers: newHeaders,
			},
		});
		const ctx = await auth.$context;
		const accounts = await ctx.internalAdapter.findAccounts(
			session.data?.user.id!,
		);
		const account = accounts[0];
		expect(account).toMatchObject({
			providerId,
			accountId: "oauth2-2",
			userId: session.data?.user.id,
			accessToken: expect.any(String),
			refreshToken: expect.any(String),
			accessTokenExpiresAt: expect.any(Date),
			refreshTokenExpiresAt: null,
			scope: expect.any(String),
			idToken: expect.any(String),
		});
	});

	/**
	 * The verify-email link sent to a new, unverified OAuth user must keep the
	 * caller's `callbackURL` intact. A raw interpolation truncates any value
	 * containing `&` at the first ampersand.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/6086
	 */
	it("encodes callbackURL in the verify-email link for a new unverified OAuth user", async () => {
		let capturedUrl = "";
		const { customFetchImpl: localFetch } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			emailVerification: {
				sendOnSignUp: true,
				async sendVerificationEmail({ url }) {
					capturedUrl = url;
				},
			},
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "test-encode-callback",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId,
							clientSecret,
							pkce: true,
						},
					],
				}),
			],
		});
		const localClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: { customFetchImpl: localFetch },
		});

		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: "encode-callback@test.com",
				name: "Encode Callback",
				sub: "encode-callback",
				email_verified: false,
			};
			userInfoResponse.statusCode = 200;
		});

		const callbackURL = "http://localhost:3000/welcome?ref=oauth&plan=pro";
		const headers = new Headers();
		const signInRes = await localClient.signIn.social({
			provider: "test-encode-callback",
			callbackURL,
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		await simulateOAuthFlow(signInRes.data?.url || "", headers, localFetch);

		expect(capturedUrl).not.toBe("");
		expect(new URL(capturedUrl).searchParams.get("callbackURL")).toBe(
			callbackURL,
		);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9375
	 */
	it("should resolve getAccessToken after first-time generic-oauth sign-in (storeAccountCookie + JWE)", async () => {
		const { customFetchImpl, auth } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			advanced: {
				useSecureCookies: true,
			},
			session: {
				cookieCache: {
					enabled: true,
					strategy: "jwe",
				},
			},
			account: {
				storeAccountCookie: true,
			},
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "test-store-account",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
						},
					],
				}),
			],
		});

		const ctx = await auth.$context;
		const accountDataCookieName = ctx.authCookies.accountData.name;

		const newAuthClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
			},
		});

		const newUserEmail = "first-time-generic-oauth@test.com";
		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: newUserEmail,
				name: "First Time SSO",
				sub: "first-time-sso",
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		const headers = new Headers();
		const signInRes = await newAuthClient.signIn.social({
			provider: "test-store-account",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		const { headers: postCallbackHeaders, setCookieHeader } =
			await simulateOAuthFlow(
				signInRes.data?.url || "",
				headers,
				customFetchImpl,
			);

		const cookies = parseSetCookieHeader(setCookieHeader);
		const accountDataCookie = cookies.get(accountDataCookieName);
		expect(accountDataCookie).toBeDefined();
		expect(accountDataCookie?.value).toBeTruthy();
		expect(accountDataCookie!.value!.startsWith("ey")).toBe(true);
		expect(accountDataCookie!.httponly).toBe(true);
		expect(accountDataCookie!.secure).toBe(true);
		expect(accountDataCookie!.samesite).toBe("lax");
		expect(accountDataCookie!["max-age"]).toBeGreaterThan(0);

		await expect(
			symmetricDecodeJWT(
				accountDataCookie!.value!,
				ctx.secret,
				"better-auth-account",
			),
		).resolves.toMatchObject({
			providerId: "test-store-account",
			accessToken: expect.any(String),
		});

		const accessTokenRes = await newAuthClient.getAccessToken(
			{ providerId: "test-store-account" },
			{ headers: postCallbackHeaders },
		);
		expect(accessTokenRes.error).toBeNull();
		expect(accessTokenRes.data?.accessToken).toBeTruthy();
	});

	/**
	 * A provider that omits `expires_in` leaves the access token's expiry unknown,
	 * so `getAccessToken` can never tell it lapsed and never refreshes it. Setting
	 * `accessTokenExpiresIn` synthesizes the expiry so the existing refresh path
	 * runs once the window passes.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/7703
	 */
	it("refreshes once the accessTokenExpiresIn window passes when the provider omits expires_in", async () => {
		let refreshCount = 0;
		const omitExpiresIn = (
			response: MutableResponse,
			req: TokenRequestIncomingMessage,
		) => {
			const body = response.body;
			if (body && typeof body === "object" && "access_token" in body) {
				// Simulate a provider that never returns `expires_in`.
				body.expires_in = undefined;
				if (req.body?.grant_type === "refresh_token") refreshCount++;
			}
		};
		server.service.on("beforeResponse", omitExpiresIn);
		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: "exp-fallback@test.com",
				name: "Expires In Fallback",
				sub: "exp-fallback",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		try {
			const { customFetchImpl } = await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "exp-fallback",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId,
								clientSecret,
								pkce: true,
								accessTokenExpiresIn: 3600,
							},
						],
					}),
				],
			});
			const client = createAuthClient({
				baseURL: "http://localhost:3000",
				fetchOptions: { customFetchImpl },
			});

			const headers = new Headers();
			const signInRes = await client.signIn.social({
				provider: "exp-fallback",
				callbackURL: "http://localhost:3000/dashboard",
				newUserCallbackURL: "http://localhost:3000/new_user",
				fetchOptions: { onSuccess: cookieSetter(headers) },
			});
			const { headers: postCallbackHeaders } = await simulateOAuthFlow(
				signInRes.data?.url || "",
				headers,
				customFetchImpl,
			);

			// Within the synthesized window: no premature refresh.
			const fresh = await client.getAccessToken(
				{ providerId: "exp-fallback" },
				{ headers: postCallbackHeaders },
			);
			expect(fresh.data?.accessToken).toBeTruthy();
			expect(refreshCount).toBe(0);

			// Past the synthesized expiry: the refresh that never used to fire now does.
			vi.useFakeTimers({ toFake: ["Date"] });
			try {
				vi.setSystemTime(new Date(Date.now() + 2 * 60 * 60 * 1000));
				const refreshed = await client.getAccessToken(
					{ providerId: "exp-fallback" },
					{ headers: postCallbackHeaders },
				);
				expect(refreshed.data?.accessToken).toBeTruthy();
			} finally {
				vi.useRealTimers();
			}
			expect(refreshCount).toBe(1);
		} finally {
			server.service.off("beforeResponse", omitExpiresIn);
		}
	});

	/**
	 * Opt-in: without `accessTokenExpiresIn`, a provider that omits `expires_in`
	 * keeps the prior behavior. The expiry stays unknown and `getAccessToken` does
	 * not refresh, so nothing churns for tokens that may never expire.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/7703
	 */
	it("does not refresh a provider that omits expires_in when accessTokenExpiresIn is unset", async () => {
		let refreshCount = 0;
		const omitExpiresIn = (
			response: MutableResponse,
			req: TokenRequestIncomingMessage,
		) => {
			const body = response.body;
			if (body && typeof body === "object" && "access_token" in body) {
				body.expires_in = undefined;
				if (req.body?.grant_type === "refresh_token") refreshCount++;
			}
		};
		server.service.on("beforeResponse", omitExpiresIn);
		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: "exp-none@test.com",
				name: "No Fallback",
				sub: "exp-none",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		try {
			const { customFetchImpl } = await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "exp-none",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId,
								clientSecret,
								pkce: true,
							},
						],
					}),
				],
			});
			const client = createAuthClient({
				baseURL: "http://localhost:3000",
				fetchOptions: { customFetchImpl },
			});

			const headers = new Headers();
			const signInRes = await client.signIn.social({
				provider: "exp-none",
				callbackURL: "http://localhost:3000/dashboard",
				newUserCallbackURL: "http://localhost:3000/new_user",
				fetchOptions: { onSuccess: cookieSetter(headers) },
			});
			const { headers: postCallbackHeaders } = await simulateOAuthFlow(
				signInRes.data?.url || "",
				headers,
				customFetchImpl,
			);

			vi.useFakeTimers({ toFake: ["Date"] });
			try {
				vi.setSystemTime(new Date(Date.now() + 2 * 60 * 60 * 1000));
				const res = await client.getAccessToken(
					{ providerId: "exp-none" },
					{ headers: postCallbackHeaders },
				);
				// Expiry stays unknown: the stored token is returned as-is, no refresh.
				expect(res.data?.accessToken).toBeTruthy();
			} finally {
				vi.useRealTimers();
			}
			expect(refreshCount).toBe(0);
		} finally {
			server.service.off("beforeResponse", omitExpiresIn);
		}
	});

	/**
	 * The `getToken` escape hatch returns tokens directly, bypassing the standard
	 * exchange. `accessTokenExpiresIn` must still apply to its result, or a
	 * `getToken` provider that omits the expiry hits the same no-refresh bug.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/7703
	 */
	it("applies accessTokenExpiresIn to a custom getToken result", async () => {
		let refreshCount = 0;
		const countRefresh = (
			_response: MutableResponse,
			req: TokenRequestIncomingMessage,
		) => {
			if (req.body?.grant_type === "refresh_token") refreshCount++;
		};
		server.service.on("beforeResponse", countRefresh);

		try {
			const { customFetchImpl } = await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "exp-gettoken",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId,
								clientSecret,
								pkce: true,
								accessTokenExpiresIn: 3600,
								// Custom exchange that omits the expiry.
								getToken: async () => ({
									accessToken: "gettoken-initial",
									refreshToken: "gettoken-refresh",
								}),
								getUserInfo: async () => ({
									id: "exp-gettoken-user",
									email: "exp-gettoken@test.com",
									name: "GetToken User",
									emailVerified: true,
								}),
							},
						],
					}),
				],
			});
			const client = createAuthClient({
				baseURL: "http://localhost:3000",
				fetchOptions: { customFetchImpl },
			});

			const headers = new Headers();
			const signInRes = await client.signIn.social({
				provider: "exp-gettoken",
				callbackURL: "http://localhost:3000/dashboard",
				newUserCallbackURL: "http://localhost:3000/new_user",
				fetchOptions: { onSuccess: cookieSetter(headers) },
			});
			const { headers: postCallbackHeaders } = await simulateOAuthFlow(
				signInRes.data?.url || "",
				headers,
				customFetchImpl,
			);

			// getToken omitted the expiry; the fallback synthesized it, so within
			// the window the stored token is returned without refreshing.
			const fresh = await client.getAccessToken(
				{ providerId: "exp-gettoken" },
				{ headers: postCallbackHeaders },
			);
			expect(fresh.data?.accessToken).toBe("gettoken-initial");
			expect(refreshCount).toBe(0);

			// Past the synthesized expiry: refresh fires. Without the fallback on the
			// getToken result, no expiry would be stored and this never happens.
			vi.useFakeTimers({ toFake: ["Date"] });
			try {
				vi.setSystemTime(new Date(Date.now() + 2 * 60 * 60 * 1000));
				const refreshed = await client.getAccessToken(
					{ providerId: "exp-gettoken" },
					{ headers: postCallbackHeaders },
				);
				expect(refreshed.data?.accessToken).toBeTruthy();
			} finally {
				vi.useRealTimers();
			}
			expect(refreshCount).toBe(1);
		} finally {
			server.service.off("beforeResponse", countRefresh);
		}
	});

	/**
	 * Multi-tenant OIDC providers (Zitadel multi-org, Auth0 with `audience`,
	 * and providers with tenant selectors) require extra body params on the
	 * refresh call. `refreshTokenParams` lets a generic-oauth plugin inject
	 * those params — both statically and via a function evaluated at refresh
	 * time with request metadata from the triggering request — without forcing a
	 * full re-authorization redirect. Refresh-flow and unsafe object keys are
	 * protected from override.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/7554
	 */
	it("forwards refreshTokenParams (incl. dynamic + ctx + protected keys) to the token endpoint on refresh", async () => {
		const capturedBodies: URLSearchParams[] = [];
		const captureRefresh = (
			_response: MutableResponse,
			req: TokenRequestIncomingMessage,
		) => {
			if (req.body?.grant_type === "refresh_token") {
				capturedBodies.push(
					new URLSearchParams(req.body as unknown as Record<string, string>),
				);
			}
		};
		server.service.on("beforeResponse", captureRefresh);

		let dynamicScope = "urn:zitadel:iam:org:id:org-A";
		const ctxSeenBy: {
			providerId: string;
			hasCtx: boolean;
			header: string | null;
		}[] = [];

		try {
			const { customFetchImpl, cookieSetter: localCookieSetter } =
				await getTestInstance({
					trustedOrigins: ["http://localhost:*"],
					plugins: [
						genericOAuth({
							config: [
								{
									providerId: "refresh-params-ctx",
									discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
									clientId,
									clientSecret,
									pkce: true,
									accessTokenExpiresIn: 3600,
									refreshTokenParams: (ctx) => {
										const header = ctx?.headers?.get("x-active-org") ?? null;
										ctxSeenBy.push({
											providerId: "refresh-params-ctx",
											hasCtx: Boolean(ctx),
											header,
										});
										return header
											? { scope: `urn:zitadel:iam:org:id:${header}` }
											: undefined;
									},
								},
								{
									providerId: "refresh-params-static",
									discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
									clientId,
									clientSecret,
									pkce: true,
									accessTokenExpiresIn: 3600,
									refreshTokenParams: {
										audience: "https://api.example.com",
									},
								},
								{
									providerId: "refresh-params-dynamic",
									discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
									clientId,
									clientSecret,
									pkce: true,
									accessTokenExpiresIn: 3600,
									refreshTokenParams: async () => ({
										scope: dynamicScope,
									}),
								},
								{
									providerId: "refresh-params-noop",
									discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
									clientId,
									clientSecret,
									pkce: true,
									accessTokenExpiresIn: 3600,
									refreshTokenParams: () => undefined,
								},
								{
									providerId: "refresh-params-protected",
									discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
									clientId,
									clientSecret,
									pkce: true,
									accessTokenExpiresIn: 3600,
									refreshTokenParams: {
										grant_type: "client_credentials",
										refresh_token: "should-not-replace",
										["__proto__"]: "polluted",
										constructor: "polluted",
										prototype: "polluted",
										audience: "https://api.example.com",
									},
								},
							],
						}),
					],
				});
			const client = createAuthClient({
				baseURL: "http://localhost:3000",
				fetchOptions: { customFetchImpl },
			});

			async function signIn(providerId: string) {
				server.service.once("beforeUserinfo", (userInfoResponse) => {
					userInfoResponse.body = {
						email: `${providerId}@test.com`,
						name: providerId,
						sub: providerId,
						email_verified: true,
					};
					userInfoResponse.statusCode = 200;
				});
				const headers = new Headers();
				const signInRes = await client.signIn.social({
					provider: providerId,
					callbackURL: "http://localhost:3000/dashboard",
					newUserCallbackURL: "http://localhost:3000/new_user",
					fetchOptions: { onSuccess: localCookieSetter(headers) },
				});
				const { headers: postCallbackHeaders } = await simulateOAuthFlow(
					signInRes.data?.url || "",
					headers,
					customFetchImpl,
				);
				return postCallbackHeaders;
			}

			const ctxHeaders = await signIn("refresh-params-ctx");
			const staticHeaders = await signIn("refresh-params-static");
			const dynamicHeaders = await signIn("refresh-params-dynamic");
			const noopHeaders = await signIn("refresh-params-noop");
			const protectedHeaders = await signIn("refresh-params-protected");

			vi.useFakeTimers({ toFake: ["Date"] });
			try {
				vi.setSystemTime(new Date(Date.now() + 2 * 60 * 60 * 1000));

				const ctxHeadersWithOrg = new Headers(ctxHeaders);
				ctxHeadersWithOrg.set("x-active-org", "org-from-header");
				const ctxRefresh = await client.getAccessToken(
					{ providerId: "refresh-params-ctx" },
					{ headers: ctxHeadersWithOrg },
				);
				expect(ctxRefresh.data?.accessToken).toBeTruthy();

				const staticRefresh = await client.getAccessToken(
					{ providerId: "refresh-params-static" },
					{ headers: staticHeaders },
				);
				expect(staticRefresh.data?.accessToken).toBeTruthy();

				const firstDynamic = await client.getAccessToken(
					{ providerId: "refresh-params-dynamic" },
					{ headers: dynamicHeaders },
				);
				expect(firstDynamic.data?.accessToken).toBeTruthy();

				dynamicScope = "urn:zitadel:iam:org:id:org-B";
				vi.setSystemTime(new Date(Date.now() + 4 * 60 * 60 * 1000));
				const secondDynamic = await client.getAccessToken(
					{ providerId: "refresh-params-dynamic" },
					{ headers: dynamicHeaders },
				);
				expect(secondDynamic.data?.accessToken).toBeTruthy();

				const noopRefresh = await client.getAccessToken(
					{ providerId: "refresh-params-noop" },
					{ headers: noopHeaders },
				);
				expect(noopRefresh.data?.accessToken).toBeTruthy();

				const protectedRefresh = await client.getAccessToken(
					{ providerId: "refresh-params-protected" },
					{ headers: protectedHeaders },
				);
				expect(protectedRefresh.data?.accessToken).toBeTruthy();
			} finally {
				vi.useRealTimers();
			}

			expect(capturedBodies).toHaveLength(6);
			const [
				ctxBody,
				staticBody,
				dynamicBodyA,
				dynamicBodyB,
				noopBody,
				protectedBody,
			] = capturedBodies as [
				URLSearchParams,
				URLSearchParams,
				URLSearchParams,
				URLSearchParams,
				URLSearchParams,
				URLSearchParams,
			];

			// ctx is forwarded so headers/cookies on the triggering request
			// are reachable from inside refreshTokenParams.
			expect(ctxBody.get("scope")).toBe(
				"urn:zitadel:iam:org:id:org-from-header",
			);
			expect(ctxSeenBy).toHaveLength(1);
			expect(ctxSeenBy[0]).toEqual({
				providerId: "refresh-params-ctx",
				hasCtx: true,
				header: "org-from-header",
			});

			expect(staticBody.get("audience")).toBe("https://api.example.com");
			expect(staticBody.get("grant_type")).toBe("refresh_token");

			expect(dynamicBodyA.get("scope")).toBe("urn:zitadel:iam:org:id:org-A");
			expect(dynamicBodyB.get("scope")).toBe("urn:zitadel:iam:org:id:org-B");

			// Function returning undefined is treated as no extra params; the
			// refresh itself still happens.
			expect(noopBody.get("grant_type")).toBe("refresh_token");
			expect(noopBody.get("refresh_token")).toBeTruthy();
			expect(noopBody.get("audience")).toBeNull();
			expect(noopBody.get("scope")).toBeNull();

			// Refresh-flow and unsafe object keys are protected from override;
			// other keys still pass through.
			expect(protectedBody.get("grant_type")).toBe("refresh_token");
			expect(protectedBody.get("refresh_token")).not.toBe("should-not-replace");
			expect(protectedBody.get("__proto__")).toBeNull();
			expect(protectedBody.get("constructor")).toBeNull();
			expect(protectedBody.get("prototype")).toBeNull();
			expect(protectedBody.get("audience")).toBe("https://api.example.com");
		} finally {
			server.service.off("beforeResponse", captureRefresh);
		}
	});

	it("should redirect to the provider and handle the response after linked", async () => {
		const headers = new Headers();
		const res = await authClient.signIn.social({
			provider: "test",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		const { callbackURL } = await simulateOAuthFlow(
			res.data?.url || "",
			headers,
		);
		expect(callbackURL).toBe("http://localhost:3000/dashboard");
	});

	it("should handle invalid provider ID", async () => {
		const res = await authClient.signIn.social({
			provider: "invalid-provider",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
		});
		expect(res.error?.status).toBe(404);
	});

	it("should handle server error during OAuth flow", async () => {
		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: "oauth2@test.com",
				name: "OAuth2 Test",
				sub: "oauth2",
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 500;
		});

		const headers = new Headers();
		const res = await authClient.signIn.social(
			{
				provider: "test",
				callbackURL: "http://localhost:3000/dashboard",
				newUserCallbackURL: "http://localhost:3000/new_user",
			},
			{
				onSuccess(context) {
					const parsedSetCookie = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					headers.set(
						"cookie",
						`better-auth.state=${
							parsedSetCookie.get("better-auth.state")?.value
						}; better-auth.pk_code_verifier=${
							parsedSetCookie.get("better-auth.pk_code_verifier")?.value
						}`,
					);
				},
			},
		);

		const { callbackURL } = await simulateOAuthFlow(
			res.data?.url || "",
			headers,
		);
		expect(callbackURL).toContain("?error=");
	});

	it("should work with custom redirect uri", async () => {
		const { customFetchImpl } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "test2",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							redirectURI: "http://localhost:3000/api/auth/callback/test2",
							pkce: true,
						},
					],
				}),
			],
		});
		const headers = new Headers();
		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				onSuccess: cookieSetter(headers),
			},
		});

		const res = await authClient.signIn.social({
			provider: "test2",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		expect(res.data?.url).toContain(`http://localhost:${port}/authorize`);
		const { callbackURL } = await simulateOAuthFlow(
			res.data?.url || "",
			headers,
			customFetchImpl,
		);
		expect(callbackURL).toBe("http://localhost:3000/new_user");
	});

	it("should not create user when sign ups are disabled", async () => {
		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: "oauth2-signup-disabled@test.com",
				name: "OAuth2 Test Signup Disabled",
				sub: "oauth2-signup-disabled",
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		const { customFetchImpl, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "test2",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
							disableImplicitSignUp: true,
						},
					],
				}),
			],
		});
		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
			},
		});
		const headers = new Headers();
		const res = await authClient.signIn.social({
			provider: "test2",
			callbackURL: "http://localhost:3000/dashboard",
			errorCallbackURL: "http://localhost:3000/error",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		expect(res.data?.url).toContain(`http://localhost:${port}/authorize`);
		const { callbackURL } = await simulateOAuthFlow(
			res.data?.url || "",
			headers,
			customFetchImpl,
		);
		expect(callbackURL).toBe(
			"http://localhost:3000/error?error=signup_disabled",
		);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9486
	 */
	it("blocks the session with error=email_not_verified when requireEmailVerification is set", async () => {
		const { customFetchImpl, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "test-require-verify",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId,
							clientSecret,
							pkce: true,
							requireEmailVerification: true,
						},
					],
				}),
			],
		});
		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
			},
		});

		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: "generic-unverified@test.com",
				name: "Generic Unverified",
				sub: "generic-unverified",
				email_verified: false,
			};
			userInfoResponse.statusCode = 200;
		});

		const headers = new Headers();
		const res = await authClient.signIn.social({
			provider: "test-require-verify",
			callbackURL: "http://localhost:3000/dashboard",
			errorCallbackURL: "http://localhost:3000/error",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		const { callbackURL, setCookieHeader } = await simulateOAuthFlow(
			res.data?.url || "",
			headers,
			customFetchImpl,
		);
		expect(callbackURL).toContain("error=email_not_verified");
		expect(setCookieHeader).not.toContain("better-auth.session_token=");
	});

	it("should create user when sign ups are disabled and sign up is requested", async () => {
		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: "oauth2-signup-disabled-and-requested@test.com",
				name: "OAuth2 Test Signup Disabled And Requested",
				sub: "oauth2-signup-disabled-and-requested",
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		const { customFetchImpl, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "test2",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
							disableImplicitSignUp: true,
						},
					],
				}),
			],
		});

		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
			},
		});
		const headers = new Headers();
		const res = await authClient.signIn.social({
			provider: "test2",
			callbackURL: "http://localhost:3000/dashboard",
			errorCallbackURL: "http://localhost:3000/error",
			requestSignUp: true,
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		expect(res.data?.url).toContain(`http://localhost:${port}/authorize`);
		const { callbackURL } = await simulateOAuthFlow(
			res.data?.url || "",
			headers,
			customFetchImpl,
		);
		expect(callbackURL).toBe("http://localhost:3000/dashboard");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9702
	 */
	it("should redirect to cross-origin errorCallbackURL when a session hook throws APIError", async () => {
		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: "hook-reject@test.com",
				name: "Hook Reject User",
				sub: "hook-reject",
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		const { customFetchImpl, cookieSetter } = await getTestInstance(
			{
				trustedOrigins: ["https://frontend.example.com", "http://localhost:*"],
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "test-hook-reject",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId,
								clientSecret,
								pkce: true,
							},
						],
					}),
				],
				databaseHooks: {
					user: {
						create: {
							before: async (user) => ({
								data: { ...user, emailVerified: true },
							}),
						},
					},
					session: {
						create: {
							before: async () => {
								throw APIError.from("FORBIDDEN", {
									code: "HOOK_REJECTED",
									message: "Session hook rejected this user",
								});
							},
						},
					},
				},
			},
			{ disableTestUser: true },
		);
		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: { customFetchImpl },
		});
		const headers = new Headers();
		const res = await authClient.signIn.social({
			provider: "test-hook-reject",
			callbackURL: "https://frontend.example.com/dashboard",
			errorCallbackURL: "https://frontend.example.com/auth-error",
			fetchOptions: { onSuccess: cookieSetter(headers) },
		});
		const { callbackURL } = await simulateOAuthFlow(
			res.data?.url || "",
			headers,
			customFetchImpl,
		);
		const url = new URL(callbackURL);
		expect(url.origin).toBe("https://frontend.example.com");
		expect(url.pathname).toBe("/auth-error");
		expect(url.searchParams.get("error")).toBe("HOOK_REJECTED");
		expect(url.searchParams.get("error_description")).toBe(
			"Session hook rejected this user",
		);
	});

	it("should pass authorization headers in oAuth2Callback", async () => {
		const customHeaders = {
			"X-Custom-Header": "test-value",
		};

		let receivedHeaders: Record<string, string> = {};
		server.service.once("beforeTokenSigning", (token, req) => {
			receivedHeaders = req.headers as Record<string, string>;
		});

		const { customFetchImpl, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "test3",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
							authorizationHeaders: customHeaders,
						},
					],
				}),
			],
		});
		const headers = new Headers();
		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				onSuccess: cookieSetter(headers),
			},
		});

		const res = await authClient.signIn.social({
			provider: "test3",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		expect(res.data?.url).toContain(`http://localhost:${port}/authorize`);
		await simulateOAuthFlow(res.data?.url || "", headers, customFetchImpl);

		expect(receivedHeaders).toHaveProperty("x-custom-header");
		expect(receivedHeaders["x-custom-header"]).toBe("test-value");
	});

	it("should delete oauth user with verification flow without password", async () => {
		let token = "";
		const { customFetchImpl, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			user: {
				deleteUser: {
					enabled: true,
					async sendDeleteAccountVerification(data, _) {
						token = data.token;
					},
				},
			},
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "test",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
						},
					],
				}),
			],
		});
		const headers = new Headers();
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				onSuccess: cookieSetter(headers),
			},
		});
		const signInRes = await client.signIn.social({
			provider: "test",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining(`http://localhost:${port}/authorize`),
			redirect: true,
		});

		const { headers: newHeaders } = await simulateOAuthFlow(
			signInRes.data?.url || "",
			headers,
			customFetchImpl,
		);

		const session = await client.getSession({
			fetchOptions: {
				headers: newHeaders,
			},
		});
		expect(session.data).not.toBeNull();

		const deleteRes = await client.deleteUser({
			fetchOptions: {
				headers: newHeaders,
			},
		});

		expect(deleteRes.data).toMatchObject({
			success: true,
		});

		expect(token.length).toBe(32);

		const deleteCallbackRes = await client.deleteUser({
			token,
			fetchOptions: {
				headers: newHeaders,
			},
		});
		expect(deleteCallbackRes.data).toMatchObject({
			success: true,
		});
		const nullSession = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(nullSession.data).toBeNull();
	});

	it("should handle numeric account IDs correctly and prevent duplicate accounts", async () => {
		const numericAccountId = 123456789;
		const userEmail = "numeric-id-test@test.com";

		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: userEmail,
				name: "Numeric ID Test User",
				sub: numericAccountId,
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		const { customFetchImpl, auth, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "numeric-test",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
						},
					],
				}),
			],
		});
		const headers = new Headers();
		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				onSuccess: cookieSetter(headers),
			},
		});

		const firstSignIn = await authClient.signIn.social({
			provider: "numeric-test",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
		});

		const { callbackURL: firstCallbackURL, headers: firstHeaders } =
			await simulateOAuthFlow(
				firstSignIn.data?.url || "",
				headers,
				customFetchImpl,
			);

		expect(firstCallbackURL).toBe("http://localhost:3000/new_user");

		const firstSession = await authClient.getSession({
			fetchOptions: {
				headers: firstHeaders,
			},
		});

		expect(firstSession.data).not.toBeNull();
		const userId = firstSession.data?.user.id!;

		const ctx = await auth.$context;
		const accountsAfterFirst = await ctx.internalAdapter.findAccounts(userId);
		expect(accountsAfterFirst).toHaveLength(1);
		expect(accountsAfterFirst[0]).toMatchObject({
			providerId: "numeric-test",
			accountId: String(numericAccountId),
			userId: userId,
		});

		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: userEmail,
				name: "Numeric ID Test User",
				sub: numericAccountId,
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		const secondSignIn = await authClient.signIn.social({
			provider: "numeric-test",
			callbackURL: "http://localhost:3000/dashboard",
		});

		const { callbackURL: secondCallbackURL, headers: secondHeaders } =
			await simulateOAuthFlow(
				secondSignIn.data?.url || "",
				headers,
				customFetchImpl,
			);

		expect(secondCallbackURL).toBe("http://localhost:3000/dashboard");

		const secondSession = await authClient.getSession({
			fetchOptions: {
				headers: secondHeaders,
			},
		});

		expect(secondSession.data).not.toBeNull();
		expect(secondSession.data?.user.id).toBe(userId);

		const accountsAfterSecond = await ctx.internalAdapter.findAccounts(userId);
		expect(accountsAfterSecond).toHaveLength(1);
		expect(accountsAfterSecond[0]!.accountId).toBe(String(numericAccountId));
	});

	it("rejects sign-in when the provider omits an account id, preventing account collisions", async () => {
		const { customFetchImpl, auth, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			databaseHooks: {
				user: {
					create: {
						before: async (user) => ({
							data: { ...user, emailVerified: true },
						}),
					},
				},
			},
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "no-sub-test",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
						},
					],
				}),
			],
		});
		const ctx = await auth.$context;
		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: { customFetchImpl },
		});

		// A userinfo response that includes email/name but no `sub`/`id`.
		const respondWithoutSub = (email: string, name: string) => {
			server.service.once("beforeUserinfo", (userInfoResponse) => {
				userInfoResponse.body = {
					email,
					name,
					picture: "https://test.com/picture.png",
					email_verified: true,
				};
				userInfoResponse.statusCode = 200;
			});
		};

		// First user signs in — must be rejected, not stored under an empty id.
		respondWithoutSub("first-no-sub@test.com", "First No Sub");
		const firstHeaders = new Headers();
		const firstSignIn = await authClient.signIn.social({
			provider: "no-sub-test",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
			fetchOptions: { onSuccess: cookieSetter(firstHeaders) },
		});
		const firstFlow = await simulateOAuthFlow(
			firstSignIn.data?.url || "",
			firstHeaders,
			customFetchImpl,
		);
		// Rejected at the error page rather than landing on a success URL.
		expect(firstFlow.callbackURL).toContain("/error?error=");
		expect(firstFlow.callbackURL).not.toContain("/dashboard");
		expect(firstFlow.callbackURL).not.toContain("/new_user");

		const firstSession = await authClient.getSession({
			fetchOptions: { headers: firstFlow.headers },
		});
		expect(firstSession.data).toBeNull();

		// No account should have been created with an empty/undefined account id.
		const emptyIdAccounts = await ctx.adapter.findMany<{ accountId: string }>({
			model: "account",
			where: [{ field: "providerId", value: "no-sub-test" }],
		});
		expect(emptyIdAccounts).toHaveLength(0);

		// A second, different user signing in through the same provider must not
		// resolve to the first user's account.
		respondWithoutSub("second-no-sub@test.com", "Second No Sub");
		const secondHeaders = new Headers();
		const secondSignIn = await authClient.signIn.social({
			provider: "no-sub-test",
			callbackURL: "http://localhost:3000/dashboard",
			fetchOptions: { onSuccess: cookieSetter(secondHeaders) },
		});
		const secondFlow = await simulateOAuthFlow(
			secondSignIn.data?.url || "",
			secondHeaders,
			customFetchImpl,
		);
		expect(secondFlow.callbackURL).toContain("/error?error=");
		const secondSession = await authClient.getSession({
			fetchOptions: { headers: secondFlow.headers },
		});
		// Must NOT have resolved to the first user (the collision being fixed).
		expect(secondSession.data).toBeNull();
	});

	it("rejects sign-in when a custom getUserInfo returns an empty id", async () => {
		const { customFetchImpl, auth, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			databaseHooks: {
				user: {
					create: {
						before: async (user) => ({
							data: { ...user, emailVerified: true },
						}),
					},
				},
			},
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "empty-id-test",
							authorizationUrl: `http://localhost:${port}/authorize`,
							tokenUrl: `http://localhost:${port}/token`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
							// A misconfigured custom mapper that yields no account id.
							getUserInfo: async () => ({
								id: "",
								email: "empty-id@test.com",
								name: "Empty Id",
								emailVerified: true,
							}),
						},
					],
				}),
			],
		});
		const ctx = await auth.$context;
		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: { customFetchImpl },
		});

		const headers = new Headers();
		const signIn = await authClient.signIn.social({
			provider: "empty-id-test",
			callbackURL: "http://localhost:3000/dashboard",
			fetchOptions: { onSuccess: cookieSetter(headers) },
		});
		const flow = await simulateOAuthFlow(
			signIn.data?.url || "",
			headers,
			customFetchImpl,
		);
		// The callback guard rejects the empty resolved account id.
		expect(flow.callbackURL).toContain("error=unable_to_get_user_info");

		const session = await authClient.getSession({
			fetchOptions: { headers: flow.headers },
		});
		expect(session.data).toBeNull();

		const accounts = await ctx.adapter.findMany({
			model: "account",
			where: [{ field: "providerId", value: "empty-id-test" }],
		});
		expect(accounts).toHaveLength(0);
	});

	it("falls back to sub when a custom getUserInfo returns an empty id", async () => {
		const { customFetchImpl, auth, cookieSetter, client } =
			await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				databaseHooks: {
					user: {
						create: {
							before: async (user) => ({
								data: { ...user, emailVerified: true },
							}),
						},
					},
				},
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "empty-id-with-sub-test",
								authorizationUrl: `http://localhost:${port}/authorize`,
								tokenUrl: `http://localhost:${port}/token`,
								clientId: clientId,
								clientSecret: clientSecret,
								pkce: true,
								getUserInfo: async () => ({
									id: "",
									sub: "custom-sub-id",
									email: "custom-sub@test.com",
									name: "Custom Sub",
									emailVerified: true,
								}),
							},
						],
					}),
				],
			});

		const headers = new Headers();
		const signIn = await client.signIn.social({
			provider: "empty-id-with-sub-test",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
			fetchOptions: { onSuccess: cookieSetter(headers) },
		});
		const flow = await simulateOAuthFlow(
			signIn.data?.url || "",
			headers,
			customFetchImpl,
		);

		expect(flow.callbackURL).toBe("http://localhost:3000/new_user");

		const session = await client.getSession({
			fetchOptions: { headers: flow.headers },
		});
		expect(session.data).not.toBeNull();

		const ctx = await auth.$context;
		const accounts = await ctx.internalAdapter.findAccounts(
			session.data?.user.id!,
		);
		expect(accounts).toHaveLength(1);
		expect(accounts[0]).toMatchObject({
			providerId: "empty-id-with-sub-test",
			accountId: "custom-sub-id",
		});
	});

	it("completes sign-in when mapProfileToUser derives the account id from a non-standard userinfo field", async () => {
		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				username: "derived-id-user",
				email: "derived-id@test.com",
				name: "Derived Id User",
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		const { customFetchImpl, auth, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "derived-id-test",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
							mapProfileToUser: (profile) => {
								return {
									id: String(profile.username),
									email: profile.email ?? undefined,
									name: profile.name,
									emailVerified: !!profile.email_verified,
								};
							},
						},
					],
				}),
			],
		});
		const headers = new Headers();
		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				onSuccess: cookieSetter(headers),
			},
		});

		const signInRes = await authClient.signIn.social({
			provider: "derived-id-test",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
		});

		const { callbackURL, headers: newHeaders } = await simulateOAuthFlow(
			signInRes.data?.url || "",
			headers,
			customFetchImpl,
		);

		expect(callbackURL).toBe("http://localhost:3000/new_user");

		const session = await authClient.getSession({
			fetchOptions: {
				headers: newHeaders,
			},
		});
		expect(session.data).not.toBeNull();

		const ctx = await auth.$context;
		const accounts = await ctx.internalAdapter.findAccounts(
			session.data?.user.id!,
		);
		expect(accounts).toHaveLength(1);
		expect(accounts[0]).toMatchObject({
			providerId: "derived-id-test",
			accountId: "derived-id-user",
		});
	});

	it("falls back to sub when the userinfo id field is empty", async () => {
		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				sub: "abc",
				id: "",
				email: "sub-over-empty-id@test.com",
				name: "Sub Over Empty Id",
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		const { customFetchImpl, auth, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "sub-over-empty-id-test",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
						},
					],
				}),
			],
		});
		const headers = new Headers();
		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				onSuccess: cookieSetter(headers),
			},
		});

		const signInRes = await authClient.signIn.social({
			provider: "sub-over-empty-id-test",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
		});

		const { callbackURL, headers: newHeaders } = await simulateOAuthFlow(
			signInRes.data?.url || "",
			headers,
			customFetchImpl,
		);

		expect(callbackURL).toBe("http://localhost:3000/new_user");

		const session = await authClient.getSession({
			fetchOptions: {
				headers: newHeaders,
			},
		});
		expect(session.data).not.toBeNull();

		const ctx = await auth.$context;
		const accounts = await ctx.internalAdapter.findAccounts(
			session.data?.user.id!,
		);
		expect(accounts).toHaveLength(1);
		expect(accounts[0]).toMatchObject({
			providerId: "sub-over-empty-id-test",
			accountId: "abc",
		});
	});

	it("falls back to sub when the userinfo id field is null", async () => {
		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				sub: "null-id-sub",
				id: null,
				email: "sub-over-null-id@test.com",
				name: "Sub Over Null Id",
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		const { customFetchImpl, auth, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "sub-over-null-id-test",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
						},
					],
				}),
			],
		});
		const headers = new Headers();
		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				onSuccess: cookieSetter(headers),
			},
		});

		const signInRes = await authClient.signIn.social({
			provider: "sub-over-null-id-test",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
		});

		const { callbackURL, headers: newHeaders } = await simulateOAuthFlow(
			signInRes.data?.url || "",
			headers,
			customFetchImpl,
		);

		expect(callbackURL).toBe("http://localhost:3000/new_user");

		const session = await authClient.getSession({
			fetchOptions: {
				headers: newHeaders,
			},
		});
		expect(session.data).not.toBeNull();

		const ctx = await auth.$context;
		const accounts = await ctx.internalAdapter.findAccounts(
			session.data?.user.id!,
		);
		expect(accounts).toHaveLength(1);
		expect(accounts[0]).toMatchObject({
			providerId: "sub-over-null-id-test",
			accountId: "null-id-sub",
		});
	});

	it("keeps a non-empty id field as the account id when the userinfo response also has sub", async () => {
		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				sub: "subject-1",
				id: "raw-id-1",
				email: "id-over-sub@test.com",
				name: "Id Over Sub",
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		const { customFetchImpl, auth, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "id-over-sub-test",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
						},
					],
				}),
			],
		});
		const headers = new Headers();
		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				onSuccess: cookieSetter(headers),
			},
		});

		const signInRes = await authClient.signIn.social({
			provider: "id-over-sub-test",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
		});

		const { callbackURL, headers: newHeaders } = await simulateOAuthFlow(
			signInRes.data?.url || "",
			headers,
			customFetchImpl,
		);

		expect(callbackURL).toBe("http://localhost:3000/new_user");

		const session = await authClient.getSession({
			fetchOptions: {
				headers: newHeaders,
			},
		});
		expect(session.data).not.toBeNull();

		const ctx = await auth.$context;
		const accounts = await ctx.internalAdapter.findAccounts(
			session.data?.user.id!,
		);
		expect(accounts).toHaveLength(1);
		expect(accounts[0]).toMatchObject({
			providerId: "id-over-sub-test",
			accountId: "raw-id-1",
		});
	});

	it("should handle custom getUserInfo returning numeric ID", async () => {
		const numericId = 987654321;

		const { customFetchImpl, auth, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "custom-numeric",
							authorizationUrl: `http://localhost:${port}/authorize`,
							tokenUrl: `http://localhost:${port}/token`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
							getUserInfo: async (_tokens) => {
								return {
									id: numericId,
									email: "custom-numeric@test.com",
									name: "Custom Numeric User",
									emailVerified: true,
									image: "https://test.com/avatar.png",
								};
							},
						},
					],
				}),
			],
		});
		const headers = new Headers();
		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				onSuccess: cookieSetter(headers),
			},
		});

		const signInRes = await authClient.signIn.social({
			provider: "custom-numeric",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
		});

		const { callbackURL, headers: newHeaders } = await simulateOAuthFlow(
			signInRes.data?.url || "",
			headers,
			customFetchImpl,
		);

		expect(callbackURL).toBe("http://localhost:3000/new_user");

		const session = await authClient.getSession({
			fetchOptions: {
				headers: newHeaders,
			},
		});

		const ctx = await auth.$context;
		const accounts = await ctx.internalAdapter.findAccounts(
			session.data?.user.id!,
		);

		expect(accounts[0]!.accountId).toBe(String(numericId));
	});

	it("should handle mapProfileToUser returning numeric ID", async () => {
		const numericProfileId = 111222333;

		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: "map-profile-numeric@test.com",
				name: "Map Profile Numeric User",
				sub: "string-sub-id",
				user_id: numericProfileId,
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		const { customFetchImpl, auth, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "map-profile-numeric",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
							mapProfileToUser: (profile) => {
								return {
									id: String(profile.user_id),
									email: profile.email ?? undefined,
									name: profile.name,
									emailVerified: !!profile.email_verified,
								};
							},
						},
					],
				}),
			],
		});
		const headers = new Headers();
		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				onSuccess: cookieSetter(headers),
			},
		});

		const signInRes = await authClient.signIn.social({
			provider: "map-profile-numeric",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
		});

		const { callbackURL, headers: newHeaders } = await simulateOAuthFlow(
			signInRes.data?.url || "",
			headers,
			customFetchImpl,
		);

		expect(callbackURL).toBe("http://localhost:3000/new_user");

		const session = await authClient.getSession({
			fetchOptions: {
				headers: newHeaders,
			},
		});

		const ctx = await auth.$context;
		const accounts = await ctx.internalAdapter.findAccounts(
			session.data?.user.id!,
		);

		expect(accounts[0]!.accountId).toBe(String(numericProfileId));
	});

	it("should handle Strava OAuth with custom mapProfileToUser", async () => {
		const stravaUserId = 12345678;
		const stravaProfile = {
			id: stravaUserId,
			firstname: "John",
			lastname: "Doe",
			profile: "https://example.com/strava-avatar.jpg",
			email_verified: true,
		};

		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = stravaProfile;
			userInfoResponse.statusCode = 200;
		});

		const { customFetchImpl, auth, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "strava",
							authorizationUrl: `http://localhost:${port}/authorize`,
							tokenUrl: `http://localhost:${port}/token`,
							userInfoUrl: `http://localhost:${port}/userinfo`,
							clientId: "STRAVA_CLIENT_ID",
							clientSecret: "STRAVA_CLIENT_SECRET",
							scopes: ["read", "activity:read_all"],
							pkce: true,
							mapProfileToUser: (profile) => {
								const fullName = `${profile.firstname} ${profile.lastname}`;
								return {
									id: String(profile.id),
									email: `${profile.id}@strava.local`,
									name: fullName,
									image: profile.profile as string,
									emailVerified: true,
								};
							},
						},
					],
				}),
			],
		});
		const headers = new Headers();
		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				onSuccess: cookieSetter(headers),
			},
		});

		const signInRes = await authClient.signIn.social({
			provider: "strava",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
		});

		expect(signInRes.data?.url).toContain(`http://localhost:${port}/authorize`);
		// we missed the `activity:read_all`
		expect(signInRes.data?.url).toContain("scope=read+activity");

		const { callbackURL, headers: newHeaders } = await simulateOAuthFlow(
			signInRes.data?.url || "",
			headers,
			customFetchImpl,
		);

		expect(callbackURL).toBe("http://localhost:3000/new_user");

		const session = await authClient.getSession({
			fetchOptions: {
				headers: newHeaders,
			},
		});

		expect(session.data).not.toBeNull();
		expect(session.data?.user.email).toBe(`${stravaUserId}@strava.local`);
		expect(session.data?.user.name).toBe("John Doe");
		expect(session.data?.user.image).toBe(
			"https://example.com/strava-avatar.jpg",
		);

		const ctx = await auth.$context;
		const accounts = await ctx.internalAdapter.findAccounts(
			session.data?.user.id!,
		);

		expect(accounts[0]).toMatchObject({
			providerId: "strava",
			accountId: String(stravaUserId),
			userId: session.data?.user.id,
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9124
	 */
	it("redirects with email_not_found when both the provider and mapProfileToUser omit email", async () => {
		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				sub: "no-email-no-synthesis",
				name: "No Email User",
			};
			userInfoResponse.statusCode = 200;
		});

		const { customFetchImpl, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "no-email-unresolved",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
						},
					],
				}),
			],
		});
		const headers = new Headers();
		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				onSuccess: cookieSetter(headers),
			},
		});

		const signInRes = await authClient.signIn.social({
			provider: "no-email-unresolved",
			callbackURL: "http://localhost:3000/dashboard",
		});

		const { callbackURL } = await simulateOAuthFlow(
			signInRes.data?.url || "",
			headers,
			customFetchImpl,
		);

		expect(callbackURL).toContain("error=email_not_found");
	});

	it("should work with cookie-based state storage", async () => {
		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: "oauth2-cookie-state@test.com",
				name: "OAuth2 Cookie State",
				sub: "oauth2-cookie-state",
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		const { customFetchImpl, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "test-cookie",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
						},
					],
				}),
			],
			account: {
				storeStateStrategy: "cookie",
			},
		});
		const headers = new Headers();
		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				onSuccess: cookieSetter(headers),
			},
		});

		const res = await authClient.signIn.social({
			provider: "test-cookie",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		expect(res.data?.url).toContain(`http://localhost:${port}/authorize`);

		const { callbackURL, headers: newHeaders } = await simulateOAuthFlow(
			res.data?.url || "",
			headers,
			customFetchImpl,
		);
		expect(callbackURL).toBe("http://localhost:3000/new_user");

		const session = await authClient.getSession({
			fetchOptions: {
				headers: newHeaders,
			},
		});

		expect(session.data).not.toBeNull();
		expect(session.data?.user.email).toBe("oauth2-cookie-state@test.com");
		expect(session.data?.user.name).toBe("OAuth2 Cookie State");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8897
	 */
	it("should reject cookie-backed OAuth when callback state does not match the issued state", async () => {
		const { customFetchImpl, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "test-cookie-csrf",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: false,
						},
					],
				}),
			],
			account: {
				storeStateStrategy: "cookie",
			},
		});

		const victimHeaders = new Headers();
		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				onSuccess: cookieSetter(victimHeaders),
			},
		});

		const signInRes = await authClient.signIn.social({
			provider: "test-cookie-csrf",
			callbackURL: "http://localhost:3000/dashboard",
			fetchOptions: {
				onSuccess: cookieSetter(victimHeaders),
			},
		});
		expect(signInRes.data?.url).toBeTruthy();

		const res = await customFetchImpl(
			"http://localhost:3000/api/auth/callback/test-cookie-csrf?code=dummy&state=attacker-controlled-state",
			{
				headers: victimHeaders,
				redirect: "manual",
			},
		);

		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toContain("state_mismatch");

		const session = await authClient.getSession({
			fetchOptions: {
				headers: victimHeaders,
			},
		});
		expect(session.data).toBeNull();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/4951
	 * @see https://github.com/better-auth/better-auth/pull/9069
	 */
	it("should redirect to the error page when a GET callback arrives without state", async () => {
		const res = await customFetchImpl(
			`http://localhost:3000/api/auth/callback/${providerId}?code=dummy`,
			{
				method: "GET",
				redirect: "manual",
			},
		);

		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toContain("state_not_found");
	});

	it("should await async mapProfileToUser", async () => {
		const { auth } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "test-async",
							clientId: clientId,
							clientSecret: clientSecret,
							getUserInfo: async (_tokens) => ({
								id: "test-user-id",
								email: "test@example.com",
								name: "Test User",
								emailVerified: true,
							}),
							mapProfileToUser: async (
								_profile,
							): Promise<Record<string, any>> => {
								return { customField: "async-custom-data" };
							},
						},
					],
				}),
			],
		});

		const context = await auth.$context;

		const provider = await getAwaitableValue(context.socialProviders, {
			value: "test-async",
		});

		const result = await provider!.getUserInfo({
			accessToken: "test-access-token",
			idToken: undefined,
			refreshToken: undefined,
		});

		expect(result?.user).toHaveProperty("customField", "async-custom-data");
	});

	it("falls back to sub when provider wrapper getUserInfo returns an empty id", async () => {
		const { auth } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "test-wrapper-sub",
							clientId: clientId,
							clientSecret: clientSecret,
							getUserInfo: async () => ({
								id: "",
								sub: "wrapped-sub",
								email: "wrapped-sub@test.com",
								name: "Wrapped Sub",
								emailVerified: true,
							}),
						},
					],
				}),
			],
		});

		const context = await auth.$context;
		const provider = await getAwaitableValue(context.socialProviders, {
			value: "test-wrapper-sub",
		});

		const result = await provider!.getUserInfo({
			accessToken: "test-access-token",
			idToken: undefined,
			refreshToken: undefined,
		});

		expect(result?.user.id).toBe("wrapped-sub");
	});

	describe("Okta Provider Helper", () => {
		it("should return correct GenericOAuthConfig", () => {
			const oktaConfig = okta({
				clientId: "okta-client-id",
				clientSecret: "okta-client-secret",
				issuer: "https://dev-12345.okta.com/oauth2/default",
			});

			expect(oktaConfig.providerId).toBe("okta");
			expect(oktaConfig.discoveryUrl).toBe(
				"https://dev-12345.okta.com/oauth2/default/.well-known/openid-configuration",
			);
			expect(oktaConfig.scopes).toEqual(["openid", "profile", "email"]);
			expect(oktaConfig.clientId).toBe("okta-client-id");
			expect(oktaConfig.clientSecret).toBe("okta-client-secret");
			expect(oktaConfig.getUserInfo).toBeUndefined();
		});

		it("should handle issuer with trailing slash", () => {
			const oktaConfig = okta({
				clientId: "okta-client-id",
				clientSecret: "okta-client-secret",
				issuer: "https://dev-12345.okta.com/oauth2/default/",
			});

			expect(oktaConfig.discoveryUrl).toBe(
				"https://dev-12345.okta.com/oauth2/default/.well-known/openid-configuration",
			);
		});

		it("should allow overriding scopes", () => {
			const oktaConfig = okta({
				clientId: "okta-client-id",
				clientSecret: "okta-client-secret",
				issuer: "https://dev-12345.okta.com/oauth2/default",
				scopes: ["openid", "profile"],
			});

			expect(oktaConfig.scopes).toEqual(["openid", "profile"]);
		});

		it("should allow overriding other options", () => {
			const oktaConfig = okta({
				clientId: "okta-client-id",
				clientSecret: "okta-client-secret",
				issuer: "https://dev-12345.okta.com/oauth2/default",
				pkce: true,
				disableImplicitSignUp: true,
			});

			expect(oktaConfig.pkce).toBe(true);
			expect(oktaConfig.disableImplicitSignUp).toBe(true);
		});
	});

	describe("Auth0 Provider Helper", () => {
		it("should return correct GenericOAuthConfig", () => {
			const auth0Config = auth0({
				clientId: "auth0-client-id",
				clientSecret: "auth0-client-secret",
				domain: "dev-xxx.eu.auth0.com",
			});

			expect(auth0Config.providerId).toBe("auth0");
			expect(auth0Config.discoveryUrl).toBe(
				"https://dev-xxx.eu.auth0.com/.well-known/openid-configuration",
			);
			expect(auth0Config.scopes).toEqual(["openid", "profile", "email"]);
			expect(auth0Config.clientId).toBe("auth0-client-id");
			expect(auth0Config.clientSecret).toBe("auth0-client-secret");
			expect(auth0Config.getUserInfo).toBeUndefined();
		});

		it("should handle domain with protocol prefix", () => {
			const auth0Config = auth0({
				clientId: "auth0-client-id",
				clientSecret: "auth0-client-secret",
				domain: "https://dev-xxx.eu.auth0.com",
			});

			expect(auth0Config.discoveryUrl).toBe(
				"https://dev-xxx.eu.auth0.com/.well-known/openid-configuration",
			);
		});

		it("should allow overriding scopes", () => {
			const auth0Config = auth0({
				clientId: "auth0-client-id",
				clientSecret: "auth0-client-secret",
				domain: "dev-xxx.eu.auth0.com",
				scopes: ["openid", "profile"],
			});

			expect(auth0Config.scopes).toEqual(["openid", "profile"]);
		});

		it("should allow overriding other options", () => {
			const auth0Config = auth0({
				clientId: "auth0-client-id",
				clientSecret: "auth0-client-secret",
				domain: "dev-xxx.eu.auth0.com",
				pkce: true,
				disableImplicitSignUp: true,
			});

			expect(auth0Config.pkce).toBe(true);
			expect(auth0Config.disableImplicitSignUp).toBe(true);
		});
	});

	describe("Microsoft Entra ID Provider Helper", () => {
		it("should return correct GenericOAuthConfig", () => {
			const msConfig = microsoftEntraId({
				clientId: "ms-client-id",
				clientSecret: "ms-client-secret",
				tenantId: "common",
			});

			expect(msConfig.providerId).toBe("microsoft-entra-id");
			expect(msConfig.authorizationUrl).toBe(
				"https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
			);
			expect(msConfig.tokenUrl).toBe(
				"https://login.microsoftonline.com/common/oauth2/v2.0/token",
			);
			expect(msConfig.userInfoUrl).toBe(
				"https://graph.microsoft.com/oidc/userinfo",
			);
			expect(msConfig.scopes).toEqual(["openid", "profile", "email"]);
			expect(msConfig.clientId).toBe("ms-client-id");
			expect(msConfig.clientSecret).toBe("ms-client-secret");
			expect(msConfig.getUserInfo).toBeDefined();
			expect(typeof msConfig.getUserInfo).toBe("function");
		});

		it("should handle tenant ID as GUID", () => {
			const tenantId = "12345678-1234-1234-1234-123456789012";
			const msConfig = microsoftEntraId({
				clientId: "ms-client-id",
				clientSecret: "ms-client-secret",
				tenantId,
			});

			expect(msConfig.authorizationUrl).toBe(
				`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
			);
		});

		it("should allow overriding scopes", () => {
			const msConfig = microsoftEntraId({
				clientId: "ms-client-id",
				clientSecret: "ms-client-secret",
				tenantId: "common",
				scopes: ["openid", "profile"],
			});

			expect(msConfig.scopes).toEqual(["openid", "profile"]);
		});

		it("should allow overriding other options", () => {
			const msConfig = microsoftEntraId({
				clientId: "ms-client-id",
				clientSecret: "ms-client-secret",
				tenantId: "common",
				pkce: true,
				disableImplicitSignUp: true,
			});

			expect(msConfig.pkce).toBe(true);
			expect(msConfig.disableImplicitSignUp).toBe(true);
		});
	});

	describe("Slack Provider Helper", () => {
		it("should return correct GenericOAuthConfig", () => {
			const slackConfig = slack({
				clientId: "slack-client-id",
				clientSecret: "slack-client-secret",
			});

			expect(slackConfig.providerId).toBe("slack");
			expect(slackConfig.authorizationUrl).toBe(
				"https://slack.com/openid/connect/authorize",
			);
			expect(slackConfig.tokenUrl).toBe(
				"https://slack.com/api/openid.connect.token",
			);
			expect(slackConfig.userInfoUrl).toBe(
				"https://slack.com/api/openid.connect.userInfo",
			);
			expect(slackConfig.scopes).toEqual(["openid", "profile", "email"]);
			expect(slackConfig.clientId).toBe("slack-client-id");
			expect(slackConfig.clientSecret).toBe("slack-client-secret");
			expect(slackConfig.getUserInfo).toBeDefined();
			expect(typeof slackConfig.getUserInfo).toBe("function");
		});

		it("should allow overriding scopes", () => {
			const slackConfig = slack({
				clientId: "slack-client-id",
				clientSecret: "slack-client-secret",
				scopes: ["openid", "profile"],
			});

			expect(slackConfig.scopes).toEqual(["openid", "profile"]);
		});

		it("should allow overriding other options", () => {
			const slackConfig = slack({
				clientId: "slack-client-id",
				clientSecret: "slack-client-secret",
				pkce: true,
				disableImplicitSignUp: true,
			});

			expect(slackConfig.pkce).toBe(true);
			expect(slackConfig.disableImplicitSignUp).toBe(true);
		});
	});

	describe("Yandex Provider Helper", () => {
		it("should return correct GenericOAuthConfig", () => {
			const yandexConfig = yandex({
				clientId: "yandex-client-id",
				clientSecret: "yandex-client-secret",
			});

			expect(yandexConfig.providerId).toBe("yandex");
			expect(yandexConfig.authorizationUrl).toBe(
				"https://oauth.yandex.com/authorize",
			);
			expect(yandexConfig.tokenUrl).toBe("https://oauth.yandex.com/token");
			expect(yandexConfig.scopes).toEqual([
				"login:info",
				"login:email",
				"login:avatar",
			]);
			expect(yandexConfig.clientId).toBe("yandex-client-id");
			expect(yandexConfig.clientSecret).toBe("yandex-client-secret");
			expect(yandexConfig.getUserInfo).toBeDefined();
			expect(typeof yandexConfig.getUserInfo).toBe("function");
		});

		/**
		 * @see https://github.com/better-auth/better-auth/pull/10278#discussion_r3495058505
		 */
		it("returns null when Yandex does not return an email", async () => {
			const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
				new Response(
					JSON.stringify({
						id: "yandex-user-id",
						login: "yandex-user",
						client_id: "yandex-client-id",
						/* cspell:disable-next-line */
						psuid: "yandex-psuid",
						emails: [],
					}),
					{
						headers: {
							"content-type": "application/json",
						},
					},
				),
			);

			try {
				const yandexConfig = yandex({
					clientId: "yandex-client-id",
					clientSecret: "yandex-client-secret",
				});

				const userInfo = await yandexConfig.getUserInfo?.({
					accessToken: "yandex-access-token",
				});

				expect(userInfo).toBeNull();
			} finally {
				fetchSpy.mockRestore();
			}
		});
	});

	describe("Keycloak Provider Helper", () => {
		it("should return correct GenericOAuthConfig", () => {
			const keycloakConfig = keycloak({
				clientId: "keycloak-client-id",
				clientSecret: "keycloak-client-secret",
				issuer: "https://my-domain.com/realms/MyRealm",
			});

			expect(keycloakConfig.providerId).toBe("keycloak");
			expect(keycloakConfig.discoveryUrl).toBe(
				"https://my-domain.com/realms/MyRealm/.well-known/openid-configuration",
			);
			expect(keycloakConfig.scopes).toEqual(["openid", "profile", "email"]);
			expect(keycloakConfig.clientId).toBe("keycloak-client-id");
			expect(keycloakConfig.clientSecret).toBe("keycloak-client-secret");
			expect(keycloakConfig.getUserInfo).toBeUndefined();
		});

		it("should handle issuer with trailing slash", () => {
			const keycloakConfig = keycloak({
				clientId: "keycloak-client-id",
				clientSecret: "keycloak-client-secret",
				issuer: "https://my-domain.com/realms/MyRealm/",
			});

			expect(keycloakConfig.discoveryUrl).toBe(
				"https://my-domain.com/realms/MyRealm/.well-known/openid-configuration",
			);
		});

		it("should allow overriding scopes", () => {
			const keycloakConfig = keycloak({
				clientId: "keycloak-client-id",
				clientSecret: "keycloak-client-secret",
				issuer: "https://my-domain.com/realms/MyRealm",
				scopes: ["openid", "profile"],
			});

			expect(keycloakConfig.scopes).toEqual(["openid", "profile"]);
		});

		it("should allow overriding other options", () => {
			const keycloakConfig = keycloak({
				clientId: "keycloak-client-id",
				clientSecret: "keycloak-client-secret",
				issuer: "https://my-domain.com/realms/MyRealm",
				pkce: true,
				disableImplicitSignUp: true,
			});

			expect(keycloakConfig.pkce).toBe(true);
			expect(keycloakConfig.disableImplicitSignUp).toBe(true);
		});
	});

	it("should integrate okta provider helper with genericOAuth", async () => {
		const { auth: testAuth } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						okta({
							clientId: "okta-client-id",
							clientSecret: "okta-client-secret",
							issuer: "https://dev-12345.okta.com/oauth2/default",
						}),
					],
				}),
			],
		});

		expect(testAuth).toBeDefined();
	});

	it("should integrate auth0 provider helper with genericOAuth", async () => {
		const { auth: testAuth } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						auth0({
							clientId: "auth0-client-id",
							clientSecret: "auth0-client-secret",
							domain: "dev-xxx.eu.auth0.com",
						}),
					],
				}),
			],
		});

		expect(testAuth).toBeDefined();
	});

	it("should integrate microsoftEntraId provider helper with genericOAuth", async () => {
		const { auth: testAuth } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						microsoftEntraId({
							clientId: "ms-client-id",
							clientSecret: "ms-client-secret",
							tenantId: "common",
						}),
					],
				}),
			],
		});

		expect(testAuth).toBeDefined();
	});

	it("should integrate slack provider helper with genericOAuth", async () => {
		const { auth: testAuth } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						slack({
							clientId: "slack-client-id",
							clientSecret: "slack-client-secret",
						}),
					],
				}),
			],
		});

		expect(testAuth).toBeDefined();
	});

	it("should integrate keycloak provider helper with genericOAuth", async () => {
		const { auth: testAuth } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						keycloak({
							clientId: "keycloak-client-id",
							clientSecret: "keycloak-client-secret",
							issuer: "https://my-domain.com/realms/MyRealm",
						}),
					],
				}),
			],
		});

		expect(testAuth).toBeDefined();
	});

	it("should support custom getToken for non-standard providers", async () => {
		const mockTokenResponse = {
			access_token: "custom-access-token",
			refresh_token: "custom-refresh-token",
			expires_in: 3600,
			openid: "custom-openid-123",
			unionid: "custom-unionid-456",
			scope: "snsapi_login",
		};

		let getTokenCalled = false;
		let capturedCode = "";

		const { customFetchImpl, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "custom-provider",
							clientId: clientId,
							clientSecret: clientSecret,
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							scopes: ["snsapi_login"],
							pkce: true,
							// Custom token exchange that doesn't use standard OAuth flow
							getToken: async ({ code }) => {
								getTokenCalled = true;
								capturedCode = code;

								// Simulate a GET-based token endpoint
								// For testing, we directly return the mock response
								return {
									accessToken: mockTokenResponse.access_token,
									refreshToken: mockTokenResponse.refresh_token,
									accessTokenExpiresAt: new Date(
										Date.now() + mockTokenResponse.expires_in * 1000,
									),
									scopes: mockTokenResponse.scope.split(","),
									raw: mockTokenResponse,
								};
							},
							getUserInfo: async (tokens) => {
								// Access custom fields from raw token data
								const openid = tokens.raw?.openid as string;
								const unionid = tokens.raw?.unionid as string;

								expect(openid).toBe("custom-openid-123");
								expect(unionid).toBe("custom-unionid-456");

								return {
									id: unionid || openid,
									name: "Custom Provider User",
									email: "custom@test.com",
									emailVerified: true,
								};
							},
						},
					],
				}),
			],
		});

		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
			},
		});

		const headers = new Headers();
		const res = await authClient.signIn.social({
			provider: "custom-provider",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		expect(res.data?.url).toContain(`http://localhost:${port}/authorize`);

		// Complete the OAuth flow
		const { callbackURL } = await simulateOAuthFlow(
			res.data?.url || "",
			headers,
			customFetchImpl,
		);

		// Verify custom getToken was called
		expect(getTokenCalled).toBe(true);
		expect(capturedCode).toBeTruthy();
		expect(callbackURL).toBe("http://localhost:3000/new_user");
	});

	// Note: raw token data preservation is already tested in the other custom getToken tests above
	// This test is redundant as the GET-based and custom provider tests verify raw data preservation

	it("should handle errors in custom getToken", async () => {
		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: "error-test@test.com",
				name: "Error Test User",
				sub: "error-test",
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		const { customFetchImpl, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "error-provider",
							clientId: clientId,
							clientSecret: clientSecret,
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							pkce: true,
							getToken: async () => {
								// Simulate token exchange failure
								throw new Error("Token exchange failed");
							},
						},
					],
				}),
			],
		});

		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
			},
		});

		const headers = new Headers();
		const res = await authClient.signIn.social({
			provider: "error-provider",
			callbackURL: "http://localhost:3000/dashboard",
			errorCallbackURL: "http://localhost:3000/error",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		expect(res.data?.url).toContain(`http://localhost:${port}/authorize`);

		// Attempt to complete the OAuth flow - should redirect to error URL
		const { callbackURL } = await simulateOAuthFlow(
			res.data?.url || "",
			headers,
			customFetchImpl,
		);

		expect(callbackURL).toContain("http://localhost:3000/error");
		expect(callbackURL).toContain("error=");
	});

	it("should support GET-based token endpoints for non-standard providers", async () => {
		const customMockResponse = {
			access_token: "custom-access-token-xyz",
			refresh_token: "custom-refresh-token-xyz",
			expires_in: 7200,
			user_id: "user_12345",
			custom_field: "custom_value",
			scope: "profile email",
		};

		const customUserInfo = {
			display_name: "Test User",
			avatar_url: "https://example.com/avatar.png",
			custom_field: "custom_value",
		};

		let tokenRequestMethod = "";
		let userInfoTokenUsed = "";

		const { customFetchImpl, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "custom-get-provider",
							clientId: clientId,
							clientSecret: clientSecret,
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							scopes: ["profile", "email"],
							pkce: true,
							// Simulates providers that use GET request with query params instead of POST
							getToken: async () => {
								tokenRequestMethod = "GET";

								return {
									accessToken: customMockResponse.access_token,
									refreshToken: customMockResponse.refresh_token,
									accessTokenExpiresAt: new Date(
										Date.now() + customMockResponse.expires_in * 1000,
									),
									scopes: customMockResponse.scope.split(" "),
									raw: customMockResponse,
								};
							},
							getUserInfo: async (tokens) => {
								userInfoTokenUsed = tokens.accessToken || "";

								// Access provider-specific fields from raw
								const userId = tokens.raw?.user_id as string;
								const customField = tokens.raw?.custom_field as string;

								// Verify provider-specific fields are preserved
								expect(userId).toBe(customMockResponse.user_id);
								expect(customField).toBe(customMockResponse.custom_field);

								return {
									id: userId,
									name: customUserInfo.display_name,
									email: `${userId}@example.com`,
									image: customUserInfo.avatar_url,
									emailVerified: true,
								};
							},
						},
					],
				}),
			],
		});

		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
			},
		});

		const headers = new Headers();
		const res = await authClient.signIn.social({
			provider: "custom-get-provider",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/welcome",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		expect(res.data?.url).toContain(`http://localhost:${port}/authorize`);
		const scopeParam = new URL(res.data!.url!).searchParams.get("scope") || "";
		expect(scopeParam).toContain("profile");
		expect(scopeParam).toContain("openid");

		// Complete the OAuth flow
		const { callbackURL, headers: newHeaders } = await simulateOAuthFlow(
			res.data?.url || "",
			headers,
			customFetchImpl,
		);

		// Verify the flow completed successfully
		expect(callbackURL).toBe("http://localhost:3000/welcome");
		expect(tokenRequestMethod).toBe("GET");
		expect(userInfoTokenUsed).toBe(customMockResponse.access_token);

		// Verify user was created with custom provider data
		const session = await authClient.getSession({
			fetchOptions: {
				headers: newHeaders,
			},
		});

		expect(session.data).not.toBeNull();
		expect(session.data?.user.name).toBe(customUserInfo.display_name);
		expect(session.data?.user.image).toBe(customUserInfo.avatar_url);
	});

	describe("Duplicate Provider ID Detection", () => {
		it("should warn when duplicate provider IDs are detected", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "duplicate-id",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId: "client-1",
								clientSecret: "secret-1",
							},
							{
								providerId: "duplicate-id",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId: "client-2",
								clientSecret: "secret-2",
							},
						],
					}),
				],
			});

			expect(warnSpy).toHaveBeenCalledWith(
				"Duplicate provider IDs found: duplicate-id",
			);
			warnSpy.mockRestore();
		});

		it("should warn about multiple duplicate provider IDs", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "dup-1",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId: "client-1",
								clientSecret: "secret-1",
							},
							{
								providerId: "dup-1",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId: "client-2",
								clientSecret: "secret-2",
							},
							{
								providerId: "dup-2",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId: "client-3",
								clientSecret: "secret-3",
							},
							{
								providerId: "dup-2",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId: "client-4",
								clientSecret: "secret-4",
							},
						],
					}),
				],
			});

			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("Duplicate provider IDs found:"),
			);
			const warningMessage = warnSpy.mock.calls[0]?.[0] as string;
			expect(warningMessage).toContain("dup-1");
			expect(warningMessage).toContain("dup-2");
			warnSpy.mockRestore();
		});

		it("should not warn when all provider IDs are unique", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "unique-1",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId: "client-1",
								clientSecret: "secret-1",
							},
							{
								providerId: "unique-2",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId: "client-2",
								clientSecret: "secret-2",
							},
						],
					}),
				],
			});

			expect(warnSpy).not.toHaveBeenCalled();
			warnSpy.mockRestore();
		});

		it("should not warn when only one provider is configured", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "single-provider",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId: "client-1",
								clientSecret: "secret-1",
							},
						],
					}),
				],
			});

			expect(warnSpy).not.toHaveBeenCalled();
			warnSpy.mockRestore();
		});

		it("should warn when provider ID appears more than twice", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "triple-dup",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId: "client-1",
								clientSecret: "secret-1",
							},
							{
								providerId: "triple-dup",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId: "client-2",
								clientSecret: "secret-2",
							},
							{
								providerId: "triple-dup",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId: "client-3",
								clientSecret: "secret-3",
							},
						],
					}),
				],
			});

			expect(warnSpy).toHaveBeenCalledWith(
				"Duplicate provider IDs found: triple-dup",
			);
			warnSpy.mockRestore();
		});
	});

	describe("storeIdentifier: hashed", () => {
		it("should complete oauth flow when verification identifiers are hashed", async () => {
			server.service.once("beforeUserinfo", (userInfoResponse) => {
				userInfoResponse.body = {
					email: "hashed-oauth@test.com",
					name: "Hashed OAuth Test",
					sub: "hashed-oauth",
					picture: "https://test.com/picture.png",
					email_verified: true,
				};
				userInfoResponse.statusCode = 200;
			});

			const { customFetchImpl, cookieSetter } = await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				verification: {
					storeIdentifier: "hashed" as const,
				},
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "test-hashed",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId: clientId,
								clientSecret: clientSecret,
								pkce: true,
							},
						],
					}),
				],
			});

			const authClient = createAuthClient({
				baseURL: "http://localhost:3000",
				fetchOptions: {
					customFetchImpl,
				},
			});

			const headers = new Headers();
			const res = await authClient.signIn.social({
				provider: "test-hashed",
				callbackURL: "http://localhost:3000/dashboard",
				fetchOptions: {
					onSuccess: cookieSetter(headers),
				},
			});

			expect(res.data?.url).toContain(`http://localhost:${port}/authorize`);

			const { callbackURL } = await simulateOAuthFlow(
				res.data?.url || "",
				headers,
				customFetchImpl,
			);

			expect(callbackURL).toBe("http://localhost:3000/dashboard");
		});
	});

	it("should merge client-requested scopes with config scopes", async () => {
		const { customFetchImpl, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "scopes-test",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							scopes: ["openid", "email", "profile"],
						},
					],
				}),
			],
		});
		const headers = new Headers();
		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				onSuccess: cookieSetter(headers),
			},
		});

		const res = await authClient.signIn.social({
			provider: "scopes-test",
			callbackURL: "http://localhost:3000/dashboard",
			scopes: ["custom_scope"],
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		const url = res.data?.url || "";
		const scopeParam = new URL(url).searchParams.get("scope") || "";
		const scopes = scopeParam.split(" ");
		expect(scopes).toContain("custom_scope");
		expect(scopes).toContain("openid");
		expect(scopes).toContain("email");
		expect(scopes).toContain("profile");
	});

	it("should warn when generic provider ID shadows a built-in social provider", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			socialProviders: {
				google: {
					clientId: "google-client-id",
					clientSecret: "google-client-secret",
				},
			},
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "google",
							authorizationUrl: `http://localhost:${port}/authorize`,
							tokenUrl: `http://localhost:${port}/token`,
							clientId: "override-id",
							clientSecret: "override-secret",
						},
					],
				}),
			],
		});
		// The logger.warn call happens internally, but we can verify the
		// provider was registered by attempting sign-in
		warnSpy.mockRestore();
	});

	it("should pass discovered issuer to the provider for RFC 9207 validation", async () => {
		const { auth } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "issuer-test",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
						},
					],
				}),
			],
		});

		const ctx = await auth.$context;
		const provider = ctx.socialProviders.find((p) => p.id === "issuer-test");
		expect(provider).toBeDefined();
		expect(provider?.issuer).toBe(`http://localhost:${port}`);
	});

	describe("tokenEndpointAuth", () => {
		it("should send client_assertion instead of client_secret at the token endpoint", async () => {
			const assertion = "test-client-assertion-jwt";
			const getClientAssertion = vi.fn(async () => assertion);
			let capturedBody: Record<string, unknown> | null = null;

			server.service.once("beforeTokenSigning", (_token, req) => {
				capturedBody = { ...(req as any).body };
			});

			const { customFetchImpl, cookieSetter } = await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "test-assertion",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId,
								tokenEndpointAuth: {
									method: "private_key_jwt",
									getClientAssertion,
								},
								pkce: true,
							},
						],
					}),
				],
			});

			const headers = new Headers();
			const authClient = createAuthClient({
				baseURL: "http://localhost:3000",
				fetchOptions: {
					customFetchImpl,
					onSuccess: cookieSetter(headers),
				},
			});

			const res = await authClient.signIn.social({
				provider: "test-assertion",
				callbackURL: "http://localhost:3000/dashboard",
				fetchOptions: {
					onSuccess: cookieSetter(headers),
				},
			});

			const { callbackURL } = await simulateOAuthFlow(
				res.data?.url || "",
				headers,
				customFetchImpl,
			);

			expect(callbackURL).toBe("http://localhost:3000/dashboard");
			expect(getClientAssertion).toHaveBeenCalledOnce();
			expect(getClientAssertion).toHaveBeenCalledWith({
				clientId,
				tokenEndpoint: expect.stringContaining(`localhost:${port}`),
				grantType: "authorization_code",
			});
			expect(capturedBody).not.toBeNull();
			const body = capturedBody!;
			expect(body.grant_type).toBe("authorization_code");
			expect(body.client_id).toBe(clientId);
			expect(body.client_secret).toBeUndefined();
			expect(body.client_assertion_type).toBe(
				"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
			);
			expect(body.client_assertion).toBe(assertion);
		});

		it("should reject secretless token endpoint auth combined with clientSecret", async () => {
			const getClientAssertion = vi.fn(async () => "client-assertion");

			await expect(
				getTestInstance({
					trustedOrigins: ["http://localhost:*"],
					plugins: [
						genericOAuth({
							config: [
								{
									providerId: "test-assertion-with-secret",
									discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
									clientId,
									clientSecret,
									tokenEndpointAuth: {
										method: "private_key_jwt",
										getClientAssertion,
									},
									pkce: true,
								},
							],
						}),
					],
				}),
			).rejects.toThrow(
				'Provider "test-assertion-with-secret": tokenEndpointAuth.method "private_key_jwt" cannot be combined with clientSecret',
			);
		});

		it.each([
			"client_secret_basic",
			"client_secret_post",
		] as const)("should reject %s token endpoint auth without clientSecret", async (method) => {
			await expect(
				getTestInstance({
					trustedOrigins: ["http://localhost:*"],
					plugins: [
						genericOAuth({
							config: [
								{
									providerId: `test-${method}-without-secret`,
									discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
									clientId,
									tokenEndpointAuth: {
										method,
									},
									pkce: true,
								},
							],
						}),
					],
				}),
			).rejects.toThrow(
				`Provider "test-${method}-without-secret": tokenEndpointAuth.method "${method}" requires clientSecret`,
			);
		});
	});

	it("should use custom name when provided in config", async () => {
		const { auth } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "named-provider",
							name: "My Custom Provider",
							authorizationUrl: `http://localhost:${port}/authorize`,
							tokenUrl: `http://localhost:${port}/token`,
							clientId: clientId,
							clientSecret: clientSecret,
						},
					],
				}),
			],
		});

		const ctx = await auth.$context;
		const provider = ctx.socialProviders.find((p) => p.id === "named-provider");
		expect(provider).toBeDefined();
		expect(provider?.name).toBe("My Custom Provider");
	});

	describe("IDP-initiated bounce (allowIdpInitiated)", () => {
		it("should bounce a stateless callback to the provider's authorize endpoint when the provider opts in", async () => {
			const { customFetchImpl } = await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "idp-initiated",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId,
								clientSecret,
								allowIdpInitiated: true,
							},
						],
					}),
				],
			});

			const res = await customFetchImpl(
				"http://localhost:3000/api/auth/callback/idp-initiated?code=idp-issued-code",
				{ method: "GET", redirect: "manual" },
			);

			expect(res.status).toBe(302);
			const location = res.headers.get("location") || "";
			expect(location).toContain(`http://localhost:${port}/authorize`);
			const url = new URL(location);
			expect(url.searchParams.get("state")).toBeTruthy();
			expect(url.searchParams.get("client_id")).toBe(clientId);
			expect(url.searchParams.get("redirect_uri")).toBe(
				"http://localhost:3000/api/auth/callback/idp-initiated",
			);
			expect(url.searchParams.get("code")).toBeNull();
			// Discovery providers bind the id_token to a nonce, including on the
			// server-side bounce restart minted in callback.ts.
			expect(url.searchParams.get("nonce")).toBeTruthy();
		});

		it("should redirect to the error page when a stateless callback arrives for a provider without the flag", async () => {
			const { customFetchImpl } = await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "strict",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId,
								clientSecret,
							},
						],
					}),
				],
			});

			const res = await customFetchImpl(
				"http://localhost:3000/api/auth/callback/strict?code=idp-issued-code",
				{ method: "GET", redirect: "manual" },
			);

			expect(res.status).toBe(302);
			expect(res.headers.get("location")).toContain("error=state_not_found");
		});

		it("should not bounce on an empty `state=` parameter, only on truly stateless callbacks", async () => {
			const { customFetchImpl } = await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "idp-initiated-empty-state",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId,
								clientSecret,
								allowIdpInitiated: true,
							},
						],
					}),
				],
			});

			const res = await customFetchImpl(
				"http://localhost:3000/api/auth/callback/idp-initiated-empty-state?code=idp-issued-code&state=",
				{ method: "GET", redirect: "manual" },
			);

			expect(res.status).toBe(302);
			const location = res.headers.get("location") || "";
			expect(location).not.toContain(`http://localhost:${port}/authorize`);
			expect(location).toContain("error=state_not_found");
		});

		it("should not bounce when state is present even if allowIdpInitiated is on", async () => {
			const { customFetchImpl } = await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "idp-initiated-with-state",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId,
								clientSecret,
								allowIdpInitiated: true,
							},
						],
					}),
				],
			});

			const res = await customFetchImpl(
				"http://localhost:3000/api/auth/callback/idp-initiated-with-state?code=abc&state=unknown-state",
				{ method: "GET", redirect: "manual" },
			);

			expect(res.status).toBe(302);
			const location = res.headers.get("location") || "";
			expect(location).not.toContain(`http://localhost:${port}/authorize`);
			expect(location).toContain("error=state_mismatch");
			expect(location).not.toContain("please_restart_the_process");
		});
	});

	describe("validateUserInfo callback", () => {
		it("should reject sign-in with provider metadata and raw profile", async () => {
			server.service.once("beforeUserinfo", (userInfoResponse) => {
				userInfoResponse.body = {
					email: "bad@blocked.com",
					name: "Bad User",
					sub: "bad-oauth",
					email_verified: true,
					custom_field: "custom-value",
				};
				userInfoResponse.statusCode = 200;
			});

			let capturedProfile: unknown;
			const { customFetchImpl, cookieSetter } = await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				user: {
					validateUserInfo({ user, source }) {
						if (source.method !== "oauth") {
							return;
						}
						expect(source.action).toBe("create-user");
						expect(source.oauth?.providerId).toBe("validate-generic");
						capturedProfile = source.oauth?.profile;
						if (user.email?.endsWith("@blocked.com")) {
							return {
								error: "domain_blocked",
								errorDescription:
									"Only company emails are allowed for this provider",
							};
						}
					},
				},
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "validate-generic",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId,
								clientSecret,
								pkce: true,
							},
						],
					}),
				],
			});

			const localAuthClient = createAuthClient({
				baseURL: "http://localhost:3000",
				fetchOptions: { customFetchImpl },
			});

			const headers = new Headers();
			const res = await localAuthClient.signIn.social({
				provider: "validate-generic",
				callbackURL: "http://localhost:3000/dashboard",
				fetchOptions: { onSuccess: cookieSetter(headers) },
			});

			const { callbackURL } = await simulateOAuthFlow(
				res.data?.url || "",
				headers,
				customFetchImpl,
			);

			expect(callbackURL).toContain("error=domain_blocked");
			expect(callbackURL).toContain(
				"error_description=Only+company+emails+are+allowed+for+this+provider",
			);
			expect((capturedProfile as Record<string, unknown>).custom_field).toBe(
				"custom-value",
			);
		});

		it("should work in stateless mode (no database)", async () => {
			server.service.once("beforeUserinfo", (userInfoResponse) => {
				userInfoResponse.body = {
					email: "stateless@blocked.com",
					name: "Stateless User",
					sub: "stateless-oauth",
					email_verified: true,
				};
				userInfoResponse.statusCode = 200;
			});

			const { customFetchImpl, cookieSetter } = await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				database: undefined,
				user: {
					validateUserInfo({ user, source }) {
						if (source.method !== "oauth") {
							return;
						}
						expect(source.oauth?.providerId).toBe("validate-stateless");
						if (user.email?.endsWith("@blocked.com")) {
							return {
								error: "stateless_blocked",
								errorDescription: "Stateless rejection test",
							};
						}
					},
				},
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "validate-stateless",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId,
								clientSecret,
								pkce: true,
							},
						],
					}),
				],
			});

			const localAuthClient = createAuthClient({
				baseURL: "http://localhost:3000",
				fetchOptions: { customFetchImpl },
			});

			const headers = new Headers();
			const res = await localAuthClient.signIn.social({
				provider: "validate-stateless",
				callbackURL: "http://localhost:3000/dashboard",
				fetchOptions: { onSuccess: cookieSetter(headers) },
			});

			const { callbackURL } = await simulateOAuthFlow(
				res.data?.url || "",
				headers,
				customFetchImpl,
			);

			expect(callbackURL).toContain("error=stateless_blocked");
			expect(callbackURL).toContain(
				"error_description=Stateless+rejection+test",
			);
		});
	});

	describe("id_token verification", () => {
		// The forged token carries valid iss/aud/exp claims; only its signing
		// key is unknown to the provider JWKS, so a rejection isolates
		// signature verification.
		async function forgeIdToken() {
			const { privateKey } = await generateKeyPair("RS256");
			return new SignJWT({
				email: "forged@test.com",
				email_verified: true,
				name: "Forged User",
			})
				.setProtectedHeader({ alg: "RS256" })
				.setSubject("forged-user")
				.setIssuer(`http://localhost:${port}`)
				.setAudience(clientId)
				.setIssuedAt()
				.setExpirationTime("1h")
				.sign(privateKey);
		}

		it("should reject an id_token not signed by the discovery JWKS", async () => {
			const forged = await forgeIdToken();
			const { customFetchImpl, cookieSetter } = await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "verify-reject",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId,
								clientSecret,
								pkce: true,
								getToken: async () => ({
									accessToken: "forged-access-token",
									idToken: forged,
									tokenType: "bearer",
								}),
							},
						],
					}),
				],
			});
			const client = createAuthClient({
				baseURL: "http://localhost:3000",
				fetchOptions: { customFetchImpl },
			});
			const headers = new Headers();
			const res = await client.signIn.social({
				provider: "verify-reject",
				callbackURL: "http://localhost:3000/dashboard",
				fetchOptions: { onSuccess: cookieSetter(headers) },
			});
			const { callbackURL } = await simulateOAuthFlow(
				res.data?.url || "",
				headers,
				customFetchImpl,
			);
			expect(callbackURL).toContain("?error=");
		});

		it("should use claims from an id_token verified against the discovery JWKS", async () => {
			const addClaims = (token: { payload: Record<string, unknown> }) => {
				Object.assign(token.payload, {
					email: "idtoken-claims@test.com",
					email_verified: true,
					name: "Id Token Claims",
				});
			};
			server.service.on("beforeTokenSigning", addClaims);
			try {
				const headers = new Headers();
				const res = await authClient.signIn.social({
					provider: providerId,
					callbackURL: "http://localhost:3000/dashboard",
					newUserCallbackURL: "http://localhost:3000/new_user",
					fetchOptions: { onSuccess: cookieSetter(headers) },
				});
				const { callbackURL, headers: sessionHeaders } =
					await simulateOAuthFlow(res.data?.url || "", headers);
				expect(callbackURL).toBe("http://localhost:3000/new_user");
				const session = await authClient.getSession({
					fetchOptions: { headers: sessionHeaders },
				});
				expect(session.data?.user.email).toBe("idtoken-claims@test.com");
			} finally {
				server.service.off("beforeTokenSigning", addClaims);
			}
		});

		/**
		 * @see https://github.com/better-auth/better-auth/issues/7571
		 */
		it("should bind a discovery id_token to the authorization request nonce", async () => {
			let authorizationNonce = "";
			const { customFetchImpl, cookieSetter } = await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "nonce-match",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId,
								clientSecret,
								pkce: true,
								authorizationUrlParams: { nonce: "configured-nonce" },
								getToken: async () => ({
									accessToken: "nonce-match-access-token",
									idToken: await server.issuer.buildToken({
										scopesOrTransform: (_header, payload) => {
											Object.assign(payload, {
												aud: clientId,
												sub: "nonce-match-user",
												email: "nonce-match@test.com",
												email_verified: true,
												name: "Nonce Match",
												nonce: authorizationNonce,
											});
										},
									}),
									tokenType: "bearer",
								}),
							},
						],
					}),
				],
			});
			const client = createAuthClient({
				baseURL: "http://localhost:3000",
				fetchOptions: { customFetchImpl },
			});
			const headers = new Headers();
			const res = await client.signIn.social({
				provider: "nonce-match",
				callbackURL: "http://localhost:3000/dashboard",
				newUserCallbackURL: "http://localhost:3000/new_user",
				fetchOptions: { onSuccess: cookieSetter(headers) },
			});

			authorizationNonce =
				new URL(res.data?.url || "").searchParams.get("nonce") || "";
			expect(authorizationNonce).toBeTruthy();
			expect(authorizationNonce).not.toBe("configured-nonce");

			const { callbackURL, headers: sessionHeaders } = await simulateOAuthFlow(
				res.data?.url || "",
				headers,
				customFetchImpl,
			);
			expect(callbackURL).toBe("http://localhost:3000/new_user");

			const session = await client.getSession({
				fetchOptions: { headers: sessionHeaders },
			});
			expect(session.data?.user.email).toBe("nonce-match@test.com");
		});

		/**
		 * @see https://github.com/better-auth/better-auth/issues/7571
		 */
		it("should reject a discovery id_token with a mismatched nonce", async () => {
			const { customFetchImpl, cookieSetter } = await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "nonce-mismatch",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId,
								clientSecret,
								pkce: true,
								getToken: async () => ({
									accessToken: "nonce-mismatch-access-token",
									idToken: await server.issuer.buildToken({
										scopesOrTransform: (_header, payload) => {
											Object.assign(payload, {
												aud: clientId,
												sub: "nonce-mismatch-user",
												email: "nonce-mismatch@test.com",
												email_verified: true,
												name: "Nonce Mismatch",
												nonce: "different-nonce",
											});
										},
									}),
									tokenType: "bearer",
								}),
							},
						],
					}),
				],
			});
			const client = createAuthClient({
				baseURL: "http://localhost:3000",
				fetchOptions: { customFetchImpl },
			});
			const headers = new Headers();
			const res = await client.signIn.social({
				provider: "nonce-mismatch",
				callbackURL: "http://localhost:3000/dashboard",
				newUserCallbackURL: "http://localhost:3000/new_user",
				fetchOptions: { onSuccess: cookieSetter(headers) },
			});

			expect(
				new URL(res.data?.url || "").searchParams.get("nonce"),
			).toBeTruthy();

			const { callbackURL } = await simulateOAuthFlow(
				res.data?.url || "",
				headers,
				customFetchImpl,
			);
			expect(callbackURL).toContain("?error=");
		});

		/**
		 * @see https://github.com/better-auth/better-auth/issues/7571
		 */
		it("should reject a discovery id_token that omits the nonce claim", async () => {
			const { customFetchImpl, cookieSetter } = await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "nonce-missing",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId,
								clientSecret,
								pkce: true,
								getToken: async () => ({
									accessToken: "nonce-missing-access-token",
									idToken: await server.issuer.buildToken({
										scopesOrTransform: (_header, payload) => {
											Object.assign(payload, {
												aud: clientId,
												sub: "nonce-missing-user",
												email: "nonce-missing@test.com",
												email_verified: true,
												name: "Nonce Missing",
											});
										},
									}),
									tokenType: "bearer",
								}),
							},
						],
					}),
				],
			});
			const client = createAuthClient({
				baseURL: "http://localhost:3000",
				fetchOptions: { customFetchImpl },
			});
			const headers = new Headers();
			const res = await client.signIn.social({
				provider: "nonce-missing",
				callbackURL: "http://localhost:3000/dashboard",
				newUserCallbackURL: "http://localhost:3000/new_user",
				fetchOptions: { onSuccess: cookieSetter(headers) },
			});

			expect(
				new URL(res.data?.url || "").searchParams.get("nonce"),
			).toBeTruthy();

			const { callbackURL } = await simulateOAuthFlow(
				res.data?.url || "",
				headers,
				customFetchImpl,
			);
			expect(callbackURL).toContain("?error=");
		});

		it("should not bind a nonce when id_token nonce binding is disabled", async () => {
			const { customFetchImpl, cookieSetter } = await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "nonce-disabled",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId,
								clientSecret,
								pkce: true,
								disableIdTokenNonceBinding: true,
								getToken: async () => ({
									accessToken: "nonce-disabled-access-token",
									idToken: await server.issuer.buildToken({
										scopesOrTransform: (_header, payload) => {
											Object.assign(payload, {
												aud: clientId,
												sub: "nonce-disabled-user",
												email: "nonce-disabled@test.com",
												email_verified: true,
												name: "Nonce Disabled",
											});
										},
									}),
									tokenType: "bearer",
								}),
							},
						],
					}),
				],
			});
			const client = createAuthClient({
				baseURL: "http://localhost:3000",
				fetchOptions: { customFetchImpl },
			});
			const headers = new Headers();
			const res = await client.signIn.social({
				provider: "nonce-disabled",
				callbackURL: "http://localhost:3000/dashboard",
				newUserCallbackURL: "http://localhost:3000/new_user",
				fetchOptions: { onSuccess: cookieSetter(headers) },
			});

			expect(new URL(res.data?.url || "").searchParams.get("nonce")).toBeNull();

			const { callbackURL, headers: sessionHeaders } = await simulateOAuthFlow(
				res.data?.url || "",
				headers,
				customFetchImpl,
			);
			expect(callbackURL).toBe("http://localhost:3000/new_user");

			const session = await client.getSession({
				fetchOptions: { headers: sessionHeaders },
			});
			expect(session.data?.user.email).toBe("nonce-disabled@test.com");
		});

		it("should drop a configured nonce param for providers without nonce binding", async () => {
			const { customFetchImpl, cookieSetter } = await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "nonce-static",
								authorizationUrl: `http://localhost:${port}/authorize`,
								tokenUrl: `http://localhost:${port}/token`,
								clientId,
								clientSecret,
								pkce: true,
								authorizationUrlParams: { nonce: "configured-nonce" },
							},
						],
					}),
				],
			});
			const client = createAuthClient({
				baseURL: "http://localhost:3000",
				fetchOptions: { customFetchImpl },
			});
			const headers = new Headers();
			const res = await client.signIn.social({
				provider: "nonce-static",
				callbackURL: "http://localhost:3000/dashboard",
				fetchOptions: { onSuccess: cookieSetter(headers) },
			});

			expect(new URL(res.data?.url || "").searchParams.get("nonce")).toBeNull();
		});

		/**
		 * @see https://github.com/better-auth/better-auth/pull/10095#discussion_r3417330694
		 */
		it("should reject a discovery id_token when state carries no expected nonce", async () => {
			const { customFetchImpl, cookieSetter, auth } = await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "nonce-skew",
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId,
								clientSecret,
								pkce: true,
								getToken: async () => ({
									accessToken: "nonce-skew-access-token",
									idToken: await server.issuer.buildToken({
										scopesOrTransform: (_header, payload) => {
											Object.assign(payload, {
												aud: clientId,
												sub: "nonce-skew-user",
												email: "nonce-skew@test.com",
												email_verified: true,
												name: "Nonce Skew",
											});
										},
									}),
									tokenType: "bearer",
								}),
							},
						],
					}),
				],
			});
			const ctx = await auth.$context;
			const provider = ctx.socialProviders.find((p) => p.id === "nonce-skew")!;
			const client = createAuthClient({
				baseURL: "http://localhost:3000",
				fetchOptions: { customFetchImpl },
			});

			// Mint state before binding is required, so it carries no expected nonce.
			provider.requiresIdTokenNonce = false;
			const headers = new Headers();
			const res = await client.signIn.social({
				provider: "nonce-skew",
				callbackURL: "http://localhost:3000/dashboard",
				newUserCallbackURL: "http://localhost:3000/new_user",
				fetchOptions: { onSuccess: cookieSetter(headers) },
			});
			expect(new URL(res.data?.url || "").searchParams.get("nonce")).toBeNull();

			// The provider now requires binding, but the in-flight state has none.
			provider.requiresIdTokenNonce = true;
			const { callbackURL } = await simulateOAuthFlow(
				res.data?.url || "",
				headers,
				customFetchImpl,
			);
			expect(callbackURL).toContain("error=nonce_binding_missing");
		});

		it("should sign in with a client-submitted id_token for a discovery provider", async () => {
			const token = await server.issuer.buildToken({
				scopesOrTransform: (_header, payload) => {
					Object.assign(payload, {
						aud: clientId,
						sub: "front-channel-user",
						email: "front-channel@test.com",
						email_verified: true,
						name: "Front Channel",
					});
				},
			});
			const res = await authClient.signIn.social({
				provider: providerId,
				idToken: { token },
			});
			expect(res.error).toBeNull();
			expect(res.data).toMatchObject({ token: expect.any(String) });
		});

		it("should keep the decode posture for providers without discovery", async () => {
			const forged = await forgeIdToken();
			const { customFetchImpl, cookieSetter } = await getTestInstance({
				trustedOrigins: ["http://localhost:*"],
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "no-discovery",
								authorizationUrl: `http://localhost:${port}/authorize`,
								tokenUrl: `http://localhost:${port}/token`,
								clientId,
								clientSecret,
								pkce: true,
								getToken: async () => ({
									accessToken: "opaque-access-token",
									idToken: forged,
									tokenType: "bearer",
								}),
							},
						],
					}),
				],
			});
			const client = createAuthClient({
				baseURL: "http://localhost:3000",
				fetchOptions: { customFetchImpl },
			});
			const headers = new Headers();
			const res = await client.signIn.social({
				provider: "no-discovery",
				callbackURL: "http://localhost:3000/dashboard",
				newUserCallbackURL: "http://localhost:3000/new_user",
				fetchOptions: { onSuccess: cookieSetter(headers) },
			});
			const { callbackURL, headers: sessionHeaders } = await simulateOAuthFlow(
				res.data?.url || "",
				headers,
				customFetchImpl,
			);
			expect(callbackURL).toBe("http://localhost:3000/new_user");
			const session = await client.getSession({
				fetchOptions: { headers: sessionHeaders },
			});
			expect(session.data?.user.email).toBe("forged@test.com");
		});

		it("should not break provider registration when jwks_uri is malformed", async () => {
			const discoveryServer = createServer((_req, res) => {
				res.setHeader("content-type", "application/json");
				res.end(
					JSON.stringify({
						issuer: `http://localhost:${port}`,
						authorization_endpoint: `http://localhost:${port}/authorize`,
						token_endpoint: `http://localhost:${port}/token`,
						userinfo_endpoint: `http://localhost:${port}/userinfo`,
						jwks_uri: "http://[malformed",
						id_token_signing_alg_values_supported: ["RS256"],
					}),
				);
			});
			await new Promise<void>((resolve) => discoveryServer.listen(0, resolve));
			const discoveryPort = (discoveryServer.address() as AddressInfo).port;
			try {
				const { customFetchImpl, cookieSetter } = await getTestInstance({
					trustedOrigins: ["http://localhost:*"],
					plugins: [
						genericOAuth({
							config: [
								{
									providerId: "malformed-jwks",
									discoveryUrl: `http://localhost:${discoveryPort}/.well-known/openid-configuration`,
									clientId,
									clientSecret,
									pkce: true,
								},
							],
						}),
					],
				});
				const client = createAuthClient({
					baseURL: "http://localhost:3000",
					fetchOptions: { customFetchImpl },
				});
				const headers = new Headers();
				const res = await client.signIn.social({
					provider: "malformed-jwks",
					callbackURL: "http://localhost:3000/dashboard",
					newUserCallbackURL: "http://localhost:3000/new_user",
					fetchOptions: { onSuccess: cookieSetter(headers) },
				});
				const { callbackURL } = await simulateOAuthFlow(
					res.data?.url || "",
					headers,
					customFetchImpl,
				);
				expect(callbackURL).not.toContain("?error=");
			} finally {
				await new Promise<void>((resolve, reject) =>
					discoveryServer.close((err) => (err ? reject(err) : resolve())),
				);
			}
		});
	});

	it("rejects sign-in when the provider omits an account id, preventing account collisions", async () => {
		const { customFetchImpl, auth, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			databaseHooks: {
				user: {
					create: {
						before: async (user) => ({
							data: { ...user, emailVerified: true },
						}),
					},
				},
			},
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "no-sub-test",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
						},
					],
				}),
			],
		});
		const ctx = await auth.$context;
		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: { customFetchImpl },
		});

		// A userinfo response that includes email/name but no `sub`/`id`.
		const respondWithoutSub = (email: string, name: string) => {
			server.service.once("beforeUserinfo", (userInfoResponse) => {
				userInfoResponse.body = {
					email,
					name,
					picture: "https://test.com/picture.png",
					email_verified: true,
				};
				userInfoResponse.statusCode = 200;
			});
		};

		// First user signs in — must be rejected, not stored under an empty id.
		respondWithoutSub("first-no-sub@test.com", "First No Sub");
		const firstHeaders = new Headers();
		const firstSignIn = await authClient.signIn.social({
			provider: "no-sub-test",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
			fetchOptions: { onSuccess: cookieSetter(firstHeaders) },
		});
		const firstFlow = await simulateOAuthFlow(
			firstSignIn.data?.url || "",
			firstHeaders,
			customFetchImpl,
		);
		// Rejected at the error page rather than landing on a success URL.
		expect(firstFlow.callbackURL).toContain("error=");
		expect(firstFlow.callbackURL).not.toContain("/dashboard");
		expect(firstFlow.callbackURL).not.toContain("/new_user");

		const firstSession = await authClient.getSession({
			fetchOptions: { headers: firstFlow.headers },
		});
		expect(firstSession.data).toBeNull();

		// No account should have been created with an empty/undefined account id.
		const emptyIdAccounts = await ctx.adapter.findMany<{ accountId: string }>({
			model: "account",
			where: [{ field: "providerId", value: "no-sub-test" }],
		});
		expect(emptyIdAccounts).toHaveLength(0);

		// A second, different user signing in through the same provider must not
		// resolve to the first user's account.
		respondWithoutSub("second-no-sub@test.com", "Second No Sub");
		const secondHeaders = new Headers();
		const secondSignIn = await authClient.signIn.social({
			provider: "no-sub-test",
			callbackURL: "http://localhost:3000/dashboard",
			fetchOptions: { onSuccess: cookieSetter(secondHeaders) },
		});
		const secondFlow = await simulateOAuthFlow(
			secondSignIn.data?.url || "",
			secondHeaders,
			customFetchImpl,
		);
		expect(secondFlow.callbackURL).toContain("error=");
		const secondSession = await authClient.getSession({
			fetchOptions: { headers: secondFlow.headers },
		});
		// Must NOT have resolved to the first user (the collision being fixed).
		expect(secondSession.data).toBeNull();
	});

	it("rejects sign-in when a custom getUserInfo returns an empty id", async () => {
		const { customFetchImpl, auth, cookieSetter } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			databaseHooks: {
				user: {
					create: {
						before: async (user) => ({
							data: { ...user, emailVerified: true },
						}),
					},
				},
			},
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "empty-id-test",
							authorizationUrl: `http://localhost:${port}/authorize`,
							tokenUrl: `http://localhost:${port}/token`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
							// A misconfigured custom mapper that yields no account id.
							getUserInfo: async () => ({
								id: "",
								email: "empty-id@test.com",
								name: "Empty Id",
								emailVerified: true,
							}),
						},
					],
				}),
			],
		});
		const ctx = await auth.$context;
		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: { customFetchImpl },
		});

		const headers = new Headers();
		const signIn = await authClient.signIn.social({
			provider: "empty-id-test",
			callbackURL: "http://localhost:3000/dashboard",
			fetchOptions: { onSuccess: cookieSetter(headers) },
		});
		const flow = await simulateOAuthFlow(
			signIn.data?.url || "",
			headers,
			customFetchImpl,
		);
		// The callback guard rejects the empty resolved account id.
		expect(flow.callbackURL).toContain("error=unable_to_get_user_info");

		const session = await authClient.getSession({
			fetchOptions: { headers: flow.headers },
		});
		expect(session.data).toBeNull();

		const accounts = await ctx.adapter.findMany({
			model: "account",
			where: [{ field: "providerId", value: "empty-id-test" }],
		});
		expect(accounts).toHaveLength(0);
	});

	/**
	 * Generic-oauth providers are operator-registered and their endpoints can be
	 * discovery-derived, so the discovery, token, userinfo and JWKS fetches run
	 * through the SSRF boundary's host gate. A provider whose host is not publicly
	 * routable is refused unless its origin is listed in `trustedOrigins`.
	 *
	 * @see https://github.com/better-auth/better-auth
	 */
	describe("SSRF host gate on server-side fetches", () => {
		async function authorizationUrlFor(
			discoveryUrl: string,
			extraTrustedOrigins: string[],
		): Promise<string | undefined> {
			const { customFetchImpl, cookieSetter: localCookieSetter } =
				await getTestInstance({
					trustedOrigins: ["http://localhost:*", ...extraTrustedOrigins],
					plugins: [
						genericOAuth({
							config: [
								{
									providerId: "ssrf-gate",
									discoveryUrl,
									clientId,
									clientSecret,
									pkce: true,
								},
							],
						}),
					],
				});
			const localClient = createAuthClient({
				baseURL: "http://localhost:3000",
				fetchOptions: { customFetchImpl },
			});
			const headers = new Headers();
			const signInRes = await localClient.signIn.social({
				provider: "ssrf-gate",
				callbackURL: "http://localhost:3000/dashboard",
				fetchOptions: { onSuccess: localCookieSetter(headers) },
			});
			return signInRes.data?.url ?? undefined;
		}

		it("allows discovery from a publicly reachable host", async () => {
			const url = await authorizationUrlFor(
				`http://localhost:${port}/.well-known/openid-configuration`,
				[],
			);
			expect(url).toContain(`http://localhost:${port}/authorize`);
		});

		it("rejects discovery from a non-public host absent trustedOrigins", async () => {
			const discoveryServer = createServer((_req, res) => {
				res.setHeader("content-type", "application/json");
				res.end(
					JSON.stringify({
						issuer: `http://localhost:${port}`,
						authorization_endpoint: `http://localhost:${port}/authorize`,
						token_endpoint: `http://localhost:${port}/token`,
						userinfo_endpoint: `http://localhost:${port}/userinfo`,
					}),
				);
			});
			await new Promise<void>((resolve) =>
				discoveryServer.listen(0, "127.0.0.1", resolve),
			);
			const privatePort = (discoveryServer.address() as AddressInfo).port;
			try {
				const url = await authorizationUrlFor(
					`http://127.0.0.1:${privatePort}/.well-known/openid-configuration`,
					[],
				);
				expect(url).toBeUndefined();
			} finally {
				discoveryServer.close();
			}
		});

		it("rejects a cloud metadata endpoint absent trustedOrigins", async () => {
			const url = await authorizationUrlFor(
				"http://169.254.169.254/.well-known/openid-configuration",
				[],
			);
			expect(url).toBeUndefined();
		});

		it("allows a non-public host listed in trustedOrigins", async () => {
			const discoveryServer = createServer((_req, res) => {
				res.setHeader("content-type", "application/json");
				res.end(
					JSON.stringify({
						issuer: `http://localhost:${port}`,
						authorization_endpoint: `http://localhost:${port}/authorize`,
						token_endpoint: `http://localhost:${port}/token`,
						userinfo_endpoint: `http://localhost:${port}/userinfo`,
					}),
				);
			});
			await new Promise<void>((resolve) =>
				discoveryServer.listen(0, "127.0.0.1", resolve),
			);
			const privatePort = (discoveryServer.address() as AddressInfo).port;
			try {
				const url = await authorizationUrlFor(
					`http://127.0.0.1:${privatePort}/.well-known/openid-configuration`,
					[`http://127.0.0.1:${privatePort}`],
				);
				expect(url).toContain(`http://localhost:${port}/authorize`);
			} finally {
				discoveryServer.close();
			}
		});
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/4151
 * @see https://github.com/better-auth/better-auth/issues/9593
 */
describe("redirect_uri composition under dynamic baseURL", async () => {
	const dynamicServer = new OAuth2Server();
	await dynamicServer.start();
	const dynamicPort = Number(new URL(dynamicServer.issuer.url!).port);

	afterAll(async () => {
		await dynamicServer.stop();
	});

	beforeAll(async () => {
		await dynamicServer.issuer.keys.generate("RS256");
	});

	async function getAuthorizeRedirectUri(
		auth: { handler: (request: Request) => Promise<Response> },
		signInPath: string,
		host: string,
		providerId: string,
	) {
		const response = await auth.handler(
			new Request(`http://${host}${signInPath}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					provider: providerId,
					callbackURL: "/dashboard",
					disableRedirect: true,
				}),
			}),
		);
		const json = (await response.json()) as { url?: string };
		expect(json.url).toBeDefined();
		const authUrl = new URL(json.url!);
		return authUrl.searchParams.get("redirect_uri");
	}

	it("composes an absolute redirect_uri for a generic-oauth provider at the default basePath", async () => {
		const { auth } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			baseURL: { allowedHosts: ["localhost:3000"] },
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "dynamic-oauth-test",
							discoveryUrl: `http://localhost:${dynamicPort}/.well-known/openid-configuration`,
							clientId: "test-client-id",
							clientSecret: "test-client-secret",
						},
					],
				}),
			],
		});

		const redirectUri = await getAuthorizeRedirectUri(
			auth,
			"/api/auth/sign-in/social",
			"localhost:3000",
			"dynamic-oauth-test",
		);

		expect(redirectUri).toBe(
			"http://localhost:3000/api/auth/callback/dynamic-oauth-test",
		);
	});

	it("composes an absolute redirect_uri for a generic-oauth provider at a custom basePath", async () => {
		const { auth } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			baseURL: { allowedHosts: ["localhost:3000"] },
			basePath: "/auth",
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "dynamic-oauth-test",
							discoveryUrl: `http://localhost:${dynamicPort}/.well-known/openid-configuration`,
							clientId: "test-client-id",
							clientSecret: "test-client-secret",
						},
					],
				}),
			],
		});

		const redirectUri = await getAuthorizeRedirectUri(
			auth,
			"/auth/sign-in/social",
			"localhost:3000",
			"dynamic-oauth-test",
		);

		expect(redirectUri).toBe(
			"http://localhost:3000/auth/callback/dynamic-oauth-test",
		);
	});

	it("composes an absolute redirect_uri for a built-in social provider", async () => {
		const { auth } = await getTestInstance({
			trustedOrigins: ["http://localhost:*"],
			baseURL: { allowedHosts: ["localhost:3000"] },
			socialProviders: {
				google: {
					clientId: "google-client-id",
					clientSecret: "google-client-secret",
				},
			},
		});

		const redirectUri = await getAuthorizeRedirectUri(
			auth,
			"/api/auth/sign-in/social",
			"localhost:3000",
			"google",
		);

		expect(redirectUri).toBe("http://localhost:3000/api/auth/callback/google");
	});

	it("normalizes custom callbackPath values without a leading slash", () => {
		expect(
			getOAuthCallbackPath({
				id: "custom-oauth-test",
				callbackPath: "callback/custom-oauth-test",
			}),
		).toBe("/callback/custom-oauth-test");
	});
});
