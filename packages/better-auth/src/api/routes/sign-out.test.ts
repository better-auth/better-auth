import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
	afterAll,
	afterEach,
	assert,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { parseSetCookieHeader } from "../../cookies";
import { nextCookies } from "../../integrations/next-js";
import type { GenericOAuthConfig } from "../../plugins/generic-oauth";
import { genericOAuth, keycloak } from "../../plugins/generic-oauth";
import { getTestInstance } from "../../test-utils/test-instance";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("sign-out", async () => {
	const afterSessionDeleted = vi.fn();
	const { signInWithTestUser, client } = await getTestInstance({
		databaseHooks: {
			session: {
				delete: {
					after: afterSessionDeleted,
				},
			},
		},
	});

	it("should sign out", async () => {
		const { runWithUser } = await signInWithTestUser();
		await runWithUser(async () => {
			const res = await client.signOut();
			expect(res.data).toMatchObject({
				success: true,
			});

			expect(afterSessionDeleted).toHaveBeenCalled();
		});
	});

	it("should clear local session cookie when reading the session fails", async () => {
		const instance = await getTestInstance();
		const { headers } = await instance.signInWithTestUser();
		const context = await instance.auth.$context;
		vi.spyOn(context.internalAdapter, "findSession").mockRejectedValueOnce(
			new Error("database unavailable"),
		);
		let setCookieHeader = "";

		const res = await instance.client.signOut({
			fetchOptions: {
				headers,
				onSuccess(context) {
					setCookieHeader = context.response.headers.get("set-cookie") || "";
				},
			},
		});

		expect(res.data).toEqual({
			success: true,
		});
		const cookies = parseSetCookieHeader(setCookieHeader);
		expect(cookies.get("better-auth.session_token")?.value).toBe("");
		expect(cookies.get("better-auth.session_token")?.["max-age"]).toBe(0);
	});

	const baseOAuthConfig = {
		providerId: "oidc-provider",
		clientId: "test-client-id",
		clientSecret: "test-client-secret",
		authorizationUrl: "https://idp.example.com/authorize",
		tokenUrl: "https://idp.example.com/token",
		userInfoUrl: "https://idp.example.com/userinfo",
	} satisfies GenericOAuthConfig;

	async function setupGenericOAuthSignOut(
		config: Partial<GenericOAuthConfig> = {},
		options: Parameters<typeof getTestInstance>[0] = {},
	) {
		const instance = await getTestInstance({
			...options,
			plugins: [
				genericOAuth({
					config: [
						{
							...baseOAuthConfig,
							...config,
						},
					],
				}),
				...(options?.plugins || []),
			],
		});
		const { headers, user } = await instance.signInWithTestUser();
		const context = await instance.auth.$context;
		await context.internalAdapter.createAccount({
			userId: user.id,
			providerId: baseOAuthConfig.providerId,
			accountId: "oauth-user",
			idToken: "id-token",
		});
		return {
			...instance,
			headers,
			user,
		};
	}

	it("should return provider logout url with id_token_hint", async () => {
		const { client, headers } = await setupGenericOAuthSignOut({
			endSessionEndpoint: "https://idp.example.com/logout",
		});
		let locationHeader: string | null = null;

		const res = await client.signOut({
			fetchOptions: {
				headers,
				onSuccess(context) {
					locationHeader = context.response.headers.get("location");
				},
			},
		});

		expect(res.data).toMatchObject({
			success: true,
			redirect: true,
			url: expect.stringContaining("https://idp.example.com/logout"),
		});
		expect(new URL(res.data!.url!).searchParams.get("id_token_hint")).toBe(
			"id-token",
		);
		expect(locationHeader).toBe(res.data!.url);
	});

	it("should keep local-only sign out when provider has no logout endpoint", async () => {
		const { client, headers } = await setupGenericOAuthSignOut();

		const res = await client.signOut({
			fetchOptions: {
				headers,
			},
		});

		expect(res.data).toEqual({
			success: true,
		});
	});

	it("should keep local-only sign out when provider logout is disabled", async () => {
		const { client, headers } = await setupGenericOAuthSignOut({
			endSessionEndpoint: "https://idp.example.com/logout",
			disableProviderLogout: true,
		});

		const res = await client.signOut({
			fetchOptions: {
				headers,
			},
		});

		expect(res.data).toEqual({
			success: true,
		});
	});

	it("should include callbackURL as post_logout_redirect_uri with state", async () => {
		const { client, headers } = await setupGenericOAuthSignOut({
			endSessionEndpoint: "https://idp.example.com/logout",
		});

		const res = await client.signOut({
			callbackURL: "/login",
			state: "logout-state",
			fetchOptions: {
				headers,
			},
		});

		const logoutUrl = new URL(res.data!.url!);
		expect(logoutUrl.searchParams.get("post_logout_redirect_uri")).toBe(
			"http://localhost:3000/login",
		);
		expect(logoutUrl.searchParams.get("client_id")).toBe("test-client-id");
		expect(logoutUrl.searchParams.get("state")).toBe("logout-state");
	});

	it("should reject untrusted callbackURL", async () => {
		const { client, headers } = await setupGenericOAuthSignOut(
			{
				endSessionEndpoint: "https://idp.example.com/logout",
			},
			{
				trustedOrigins: ["http://localhost:3000"],
				advanced: {
					disableOriginCheck: false,
				},
			},
		);
		headers.set("origin", "http://localhost:3000");

		const res = await client.signOut({
			callbackURL: "https://evil.example.com/logout",
			fetchOptions: {
				headers,
			},
		});

		expect(res.error).toMatchObject({
			status: 403,
			message: "Invalid callbackURL",
		});
	});

	it("should return provider logout url without redirect when disabled", async () => {
		const { client, headers } = await setupGenericOAuthSignOut({
			endSessionEndpoint: "https://idp.example.com/logout",
		});
		let locationHeader: string | null = null;

		const res = await client.signOut({
			disableRedirect: true,
			fetchOptions: {
				headers,
				onSuccess(context) {
					locationHeader = context.response.headers.get("location");
				},
			},
		});

		expect(res.data).toMatchObject({
			success: true,
			redirect: false,
			url: expect.stringContaining("https://idp.example.com/logout"),
		});
		expect(locationHeader).toBeNull();
	});

	it("should use the most recently updated provider when multiple linked accounts exist", async () => {
		const secondProviderConfig = {
			...baseOAuthConfig,
			providerId: "second-provider",
			endSessionEndpoint: "https://idp2.example.com/logout",
		} satisfies GenericOAuthConfig;
		const instance = await getTestInstance({
			plugins: [
				genericOAuth({
					config: [
						{
							...baseOAuthConfig,
							endSessionEndpoint: "https://idp.example.com/logout",
						},
						secondProviderConfig,
					],
				}),
			],
		});
		const { headers, user } = await instance.signInWithTestUser();
		const context = await instance.auth.$context;
		await context.internalAdapter.createAccount({
			userId: user.id,
			providerId: baseOAuthConfig.providerId,
			accountId: "oauth-user",
			idToken: "id-token-first",
			updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		});
		await context.internalAdapter.createAccount({
			userId: user.id,
			providerId: secondProviderConfig.providerId,
			accountId: "oauth-user-2",
			idToken: "id-token-second",
			updatedAt: new Date("2026-01-02T00:00:00.000Z"),
		});

		const res = await instance.client.signOut({
			fetchOptions: {
				headers,
			},
		});

		expect(res.data).toMatchObject({
			success: true,
			redirect: true,
			url: expect.stringContaining("https://idp2.example.com/logout"),
		});
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/11991
 */
describe("provider sign-out with the account cookie", () => {
	const baseURL = "http://localhost:3000";
	const issuer = "https://keycloak.example.com/realms/sign-out";
	const protocolURL = `${issuer}/protocol/openid-connect`;
	const logoutEndpoint = `${protocolURL}/logout`;
	const clientId = "sign-out-client";

	const startServer = (
		options: { stateless?: boolean; encryptOAuthTokens?: boolean } = {},
	) =>
		getTestInstance(
			{
				baseURL,
				secret: "stable-secret-across-restarts-for-sign-out",
				...(options.stateless ? { database: undefined } : {}),
				account: {
					storeStateStrategy: "cookie",
					storeAccountCookie: true,
					encryptOAuthTokens: options.encryptOAuthTokens,
				},
				plugins: [
					genericOAuth({
						config: [
							keycloak({
								clientId,
								clientSecret: "sign-out-client-secret",
								issuer,
							}),
						],
					}),
					nextCookies(),
				],
			},
			{ disableTestUser: true },
		);

	const useKeycloak = async () => {
		const { privateKey, publicKey } = await generateKeyPair("RS256");
		const jwk = await exportJWK(publicKey);
		const issued = { nonce: "", idToken: "" };
		server.use(
			http.get(`${issuer}/.well-known/openid-configuration`, () =>
				HttpResponse.json({
					issuer,
					authorization_endpoint: `${protocolURL}/auth`,
					token_endpoint: `${protocolURL}/token`,
					userinfo_endpoint: `${protocolURL}/userinfo`,
					end_session_endpoint: logoutEndpoint,
					jwks_uri: `${protocolURL}/certs`,
					id_token_signing_alg_values_supported: ["RS256"],
					response_types_supported: ["code"],
					subject_types_supported: ["public"],
				}),
			),
			http.get(`${protocolURL}/certs`, () =>
				HttpResponse.json({
					keys: [{ ...jwk, kid: "sign-out-key", use: "sig" }],
				}),
			),
			http.post(`${protocolURL}/token`, async () => {
				issued.idToken = await new SignJWT({
					nonce: issued.nonce,
					email: "keycloak-user@example.com",
					email_verified: true,
					name: "Keycloak User",
					sid: "keycloak-session",
				})
					.setProtectedHeader({ alg: "RS256", kid: "sign-out-key" })
					.setIssuer(issuer)
					.setAudience(clientId)
					.setSubject("keycloak-user")
					.setIssuedAt()
					.setExpirationTime("1h")
					.sign(privateKey);
				return HttpResponse.json({
					access_token: "keycloak-access-token",
					refresh_token: "keycloak-refresh-token",
					id_token: issued.idToken,
					token_type: "Bearer",
					expires_in: 3600,
					scope: "openid profile email",
				});
			}),
		);
		return issued;
	};

	const signIn = async (
		instance: Awaited<ReturnType<typeof startServer>>,
		issued: Awaited<ReturnType<typeof useKeycloak>>,
	) => {
		const headers = new Headers();
		const started = await instance.client.signIn.social({
			provider: "keycloak",
			callbackURL: `${baseURL}/dashboard`,
			fetchOptions: { onSuccess: instance.cookieSetter(headers) },
		});
		expect(started.data).toMatchObject({ url: expect.any(String) });
		const authorizationURL = new URL(started.data!.url!);
		issued.nonce = authorizationURL.searchParams.get("nonce")!;
		const callbackURL = new URL(
			authorizationURL.searchParams.get("redirect_uri")!,
		);
		callbackURL.searchParams.set(
			"state",
			authorizationURL.searchParams.get("state")!,
		);
		callbackURL.searchParams.set("code", "keycloak-authorization-code");
		const callback = await instance.customFetchImpl(callbackURL, { headers });
		expect(callback.headers.get("location")).toBe(`${baseURL}/dashboard`);
		instance.cookieSetter(headers)({ response: callback });
		return { headers, idToken: issued.idToken };
	};

	const signOut = async (
		instance: Awaited<ReturnType<typeof startServer>>,
		headers: Headers,
	) => {
		let location: string | null = null;
		const result = await instance.client.signOut({
			fetchOptions: {
				headers,
				onSuccess(context) {
					location = context.response.headers.get("location");
					instance.cookieSetter(headers)(context);
				},
			},
		});
		await expect(instance.auth.api.getSession({ headers })).resolves.toBeNull();
		return { ...result, location };
	};

	it.for([
		{ restart: true, encryptOAuthTokens: false },
		{ restart: false, encryptOAuthTokens: false },
		{ restart: true, encryptOAuthTokens: true },
		{ restart: false, encryptOAuthTokens: true },
	])(
		"returns the provider logout URL without a database (restart: $restart, encrypted: $encryptOAuthTokens)",
		async ({ restart, encryptOAuthTokens }) => {
			const issued = await useKeycloak();
			const original = await startServer({
				stateless: true,
				encryptOAuthTokens,
			});
			const { headers, idToken } = await signIn(original, issued);
			// A fresh instance keeps none of the previous one's in-memory records.
			const active = restart
				? await startServer({ stateless: true, encryptOAuthTokens })
				: original;

			const { data, location } = await signOut(active, headers);

			expect(data).toMatchObject({
				success: true,
				url: expect.stringContaining(logoutEndpoint),
				redirect: true,
			});
			expect(location).toBe(data?.url);
			expect(new URL(data!.url!).searchParams.get("id_token_hint")).toBe(
				idToken,
			);
		},
	);

	it("does not use the account cookie when the database no longer has the session", async () => {
		const issued = await useKeycloak();
		const instance = await startServer();
		const { headers } = await signIn(instance, issued);
		const session = await instance.auth.api.getSession({ headers });
		assert(session, "expected a session");
		const context = await instance.auth.$context;
		await context.internalAdapter.deleteSession(session.session.token);

		const { data } = await signOut(instance, headers);

		expect(data).toEqual({ success: true });
	});
});
