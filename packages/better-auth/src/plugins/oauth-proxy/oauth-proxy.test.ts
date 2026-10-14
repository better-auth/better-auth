import type { SecretConfig } from "@better-auth/core";
import type { OAuthProvider } from "@better-auth/core/oauth2";
import type { GoogleProfile } from "@better-auth/core/social-providers";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import {
	addOAuthServerContext,
	createAuthMiddleware,
	getOAuthState,
} from "../../api";
import { parseJSON } from "../../client/parser";
import { signJWT, symmetricDecrypt, symmetricEncrypt } from "../../crypto";
import { derivePurposeKey } from "../../crypto/purpose";
import { getTestInstance } from "../../test-utils/test-instance";
import { DEFAULT_SECRET } from "../../utils/constants";
import { oAuthProxy, packCompactState, unpackCompactState } from ".";

let testIdToken: string;
let handlers: ReturnType<typeof http.post>[];

const server = setupServer();

beforeAll(async () => {
	const data: GoogleProfile = {
		email: "user@email.com",
		email_verified: true,
		name: "First Last",
		picture: "https://lh3.googleusercontent.com/a-/AOh14GjQ4Z7Vw",
		exp: 1234567890,
		sub: "1234567890",
		iat: 1234567890,
		aud: "test",
		azp: "test",
		nbf: 1234567890,
		iss: "test",
		locale: "en",
		jti: "test",
		given_name: "First",
		family_name: "Last",
	};
	testIdToken = await signJWT(data, DEFAULT_SECRET);

	handlers = [
		http.post("https://oauth2.googleapis.com/token", () => {
			return HttpResponse.json({
				access_token: "test",
				refresh_token: "test",
				id_token: testIdToken,
				expires_in: 3600,
				refresh_token_expires_in: 86400,
			});
		}),
		http.post("https://api.x.com/2/oauth2/token", () => {
			return HttpResponse.json({
				token_type: "bearer",
				access_token: "twitter-access-token",
				expires_in: 7200,
				scope: "users.read tweet.read",
			});
		}),
		http.get("https://api.x.com/2/users/me", () => {
			return HttpResponse.json({
				data: {
					id: "twitter-user-12345",
					name: "Twitter Test User",
					username: "twitter_user",
					profile_image_url: "https://x.com/avatar.png",
				},
			});
		}),
	];

	server.listen({ onUnhandledRequest: "bypass" });
	server.use(...handlers);
});

afterEach(() => {
	server.resetHandlers();
	server.use(...handlers);
});

afterAll(() => server.close());

describe("oauth-proxy", async () => {
	/**
	 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-965c-763c-88jm
	 */
	it("packages database state after verification identifiers are namespaced", async () => {
		const proxySecret = "shared-proxy-purpose-test-secret";
		const { auth, client } = await getTestInstance({
			baseURL: "http://preview.example.com",
			plugins: [
				oAuthProxy({
					productionURL: "http://localhost:3000",
					secret: proxySecret,
				}),
			],
		});
		const signIn = await client.signIn.social(
			{ provider: "google", callbackURL: "/dashboard" },
			{ throw: true },
		);
		if (!signIn.url) throw new Error("OAuth authorization URL missing");
		const encryptedPackage = new URL(signIn.url).searchParams.get("state");
		if (!encryptedPackage) throw new Error("OAuth proxy state missing");
		const payload = await unpackCompactState(
			derivePurposeKey(proxySecret, "oauth-proxy-package"),
			encryptedPackage,
		);
		if (!payload) throw new Error("Failed to unpack compact state package");
		expect(payload.isOAuthProxy).toBe(true);
		expect(
			await (await auth.$context).internalAdapter.findVerificationValue(
				`auth-state:${payload.state}`,
			),
		).not.toBeNull();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-r4xp-prcw-77qf
	 */
	it.each([
		["/callback/google/oauth-proxy", "state-cookie"],
		["/oauth-proxy-callback", "state-cookie"],
		["/callback/google/oauth-proxy", "pre-upgrade"],
		["/oauth-proxy-callback", "pre-upgrade"],
	] as const)("rejects profile input on %s encrypted for %s", async (path, source) => {
		const { auth, client } = await getTestInstance({
			plugins: [oAuthProxy()],
		});
		const { secretConfig } = await auth.$context;
		const encryptedState = await symmetricEncrypt({
			key:
				source === "state-cookie"
					? derivePurposeKey(secretConfig, "oauth-state-cookie")
					: secretConfig,
			data: JSON.stringify({ callbackURL: "/dashboard" }),
		});
		let location: string | null = null;
		await client.$fetch(
			`${path}?callbackURL=%2Fdashboard&profile=${encodeURIComponent(encryptedState)}`,
			{
				onError(context) {
					location = context.response.headers.get("location");
				},
			},
		);
		expect(location).toContain("error=invalid_profile");
	});
	it("redirects when a provider cannot derive a stable account identity", async () => {
		const provider = {
			id: "invalid-account-identity",
			name: "Invalid account identity",
			accountSubject: () => "",
			createAuthorizationURL: ({ state }) =>
				new URL(`https://idp.example.com/authorize?state=${state}`),
			validateAuthorizationCode: async () => ({
				accessToken: "access-token",
			}),
			getUserInfo: async () => ({
				user: {
					email: "user@example.com",
					emailVerified: true,
				},
				data: {},
			}),
		} satisfies OAuthProvider<Record<string, never>>;

		const { client } = await getTestInstance({
			plugins: [
				{
					id: "invalid-account-identity-provider",
					init: (ctx) => ({
						context: {
							socialProviders: [provider, ...ctx.socialProviders],
						},
					}),
				},
				oAuthProxy({ currentURL: "http://preview.example.com" }),
			],
		});

		const signIn = await client.signIn.social(
			{
				provider: provider.id,
				callbackURL: "/dashboard",
			},
			{ throw: true },
		);
		const state = new URL(signIn.url!).searchParams.get("state");

		let redirectURL: string | null = null;
		await client.$fetch(`/callback/${provider.id}?code=test&state=${state}`, {
			onError(context) {
				redirectURL = context.response.headers.get("location");
			},
		});

		expect(redirectURL).not.toBeNull();
		expect(new URL(redirectURL!).searchParams.get("error")).toBe(
			"unable_to_get_user_info",
		);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9390
	 */
	describe("account linking", () => {
		const proxySecret = "shared-oauth-proxy-secret";
		const socialProviders = {
			google: {
				clientId: "test",
				clientSecret: "test",
				verifyIdToken: async () => true,
			},
		};

		async function createAccountLinkingFlow() {
			const preview = await getTestInstance({
				baseURL: "http://preview.example.com",
				secret: "preview-main-secret",
				plugins: [
					oAuthProxy({
						productionURL: "http://localhost:3000",
						secret: proxySecret,
					}),
				],
				socialProviders,
				account: {
					accountLinking: { allowDifferentEmails: true },
				},
			});
			const production = await getTestInstance(
				{
					baseURL: "http://localhost:3000",
					secret: "production-main-secret",
					plugins: [oAuthProxy({ secret: proxySecret })],
					socialProviders,
				},
				{ disableTestUser: true },
			);
			const { user, headers } = await preview.signInWithTestUser();

			async function completeLink(accessToken: string, scope: string) {
				let tokenRedirectURI: string | null = null;
				server.use(
					http.post(
						"https://oauth2.googleapis.com/token",
						async ({ request }) => {
							const body = await request.formData();
							const redirectURI = body.get("redirect_uri");
							tokenRedirectURI =
								typeof redirectURI === "string" ? redirectURI : null;
							return HttpResponse.json({
								access_token: accessToken,
								refresh_token: "test",
								id_token: testIdToken,
								expires_in: 3600,
								refresh_token_expires_in: 86400,
								scope,
							});
						},
					),
				);
				const link = await preview.client.linkSocial(
					{
						provider: "google",
						callbackURL: "/settings",
					},
					{ headers },
				);
				const authorizationURL = link.data?.url;
				if (!authorizationURL) throw new Error("Authorization URL is missing");
				const authorization = new URL(authorizationURL);
				const authorizationRedirectURI =
					authorization.searchParams.get("redirect_uri");
				const state = authorization.searchParams.get("state");
				if (!state) throw new Error("OAuth state is missing");

				let proxyCallbackURL: string | null = null;
				await production.client.$fetch(
					`/callback/google?code=test&state=${encodeURIComponent(state)}`,
					{
						onError(context) {
							proxyCallbackURL = context.response.headers.get("location");
						},
					},
				);
				if (!proxyCallbackURL) throw new Error("Proxy callback URL is missing");

				const proxyCallback = new URL(proxyCallbackURL);
				const callbackPath = `${proxyCallback.pathname.replace(
					"/api/auth",
					"",
				)}${proxyCallback.search}`;
				let finalRedirect: string | null = null;
				await preview.client.$fetch(callbackPath, {
					headers,
					onError(context) {
						finalRedirect = context.response.headers.get("location");
					},
				});

				return {
					authorizationRedirectURI,
					finalRedirect,
					tokenRedirectURI,
				};
			}

			return { completeLink, preview, user };
		}

		it("creates and updates the provider account for the initiating user", async () => {
			const { completeLink, preview, user } = await createAccountLinkingFlow();
			const previewContext = await preview.auth.$context;
			const sessionsBefore = await previewContext.adapter.findMany<{
				id: string;
			}>({
				model: "session",
				where: [{ field: "userId", value: user.id }],
			});
			const firstLink = await completeLink(
				"initial-access-token",
				"openid profile",
			);

			const accountsAfterFirstLink =
				await previewContext.internalAdapter.findAccounts(user.id);
			const firstGoogleAccount = accountsAfterFirstLink.find(
				(account) => account.providerId === "google",
			);
			expect(firstLink.authorizationRedirectURI).toBe(
				"http://localhost:3000/api/auth/callback/google",
			);
			expect(firstLink.tokenRedirectURI).toBe(
				firstLink.authorizationRedirectURI,
			);
			expect(firstLink.finalRedirect).toBe("/settings");
			expect(firstGoogleAccount?.scope).toBe("openid,profile");

			const secondLink = await completeLink(
				"updated-access-token",
				"https://www.googleapis.com/auth/drive.readonly",
			);
			const accountsAfterSecondLink =
				await previewContext.internalAdapter.findAccounts(user.id);
			const googleAccounts = accountsAfterSecondLink.filter(
				(account) => account.providerId === "google",
			);
			const sessionsAfter = await previewContext.adapter.findMany<{
				id: string;
			}>({
				model: "session",
				where: [{ field: "userId", value: user.id }],
			});

			expect(secondLink.finalRedirect).toBe("/settings");
			expect(googleAccounts).toHaveLength(1);
			expect(googleAccounts[0]?.accessToken).toBe("updated-access-token");
			expect(googleAccounts[0]?.scope?.split(",").sort()).toEqual([
				"https://www.googleapis.com/auth/drive.readonly",
				"openid",
				"profile",
			]);
			expect(sessionsAfter.map((session) => session.id)).toEqual(
				sessionsBefore.map((session) => session.id),
			);
		});

		it("links an account directly with an ID token", async () => {
			const { auth, client, signInWithTestUser } = await getTestInstance({
				baseURL: "http://preview.example.com",
				plugins: [oAuthProxy({ productionURL: "http://localhost:3000" })],
				socialProviders,
				account: {
					accountLinking: { allowDifferentEmails: true },
				},
			});
			const { headers, user } = await signInWithTestUser();

			const result = await client.linkSocial(
				{
					provider: "google",
					idToken: { token: testIdToken },
				},
				{ headers },
			);

			expect(result.error).toBeNull();
			expect(result.data).toMatchObject({
				status: true,
				redirect: false,
			});

			const context = await auth.$context;
			const accounts = await context.internalAdapter.findAccounts(user.id);
			expect(accounts.some((account) => account.providerId === "google")).toBe(
				true,
			);
		});
	});

	it("should redirect to proxy url with profile data (passthrough)", async () => {
		const { client } = await getTestInstance({
			plugins: [
				oAuthProxy({
					currentURL: "http://preview-localhost:3000",
				}),
			],
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
				},
			},
		});

		const res = await client.signIn.social(
			{
				provider: "google",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
			},
		);

		const state = new URL(res.url!).searchParams.get("state");

		await client.$fetch(`/callback/google?code=test&state=${state}`, {
			onError(context) {
				const location = context.response.headers.get("location") ?? "";
				if (!location) {
					throw new Error("Location header not found");
				}
				expect(location).toContain(
					"http://preview-localhost:3000/api/auth/callback/google/oauth-proxy",
				);
				expect(location).toContain("callbackURL");
				// Should have profile parameter (passthrough mode)
				const profile = new URL(location).searchParams.get("profile");
				expect(profile).toBeTruthy();
			},
		});
	});

	it("shouldn't redirect to proxy url on same origin", async () => {
		const { client, cookieSetter } = await getTestInstance({
			plugins: [oAuthProxy()],
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
				},
			},
		});
		const headers = new Headers();
		const res = await client.signIn.social(
			{
				provider: "google",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		);
		const state = new URL(res.url!).searchParams.get("state");
		await client.$fetch(`/callback/google?code=test&state=${state}`, {
			headers,
			onError(context) {
				const location = context.response.headers.get("location");
				if (!location) {
					throw new Error("Location header not found");
				}
				expect(location).not.toContain("/api/auth/callback/google/oauth-proxy");
				expect(location).toContain("/dashboard");
			},
		});
	});

	it("should proxy to the original request url", async () => {
		const { client } = await getTestInstance({
			baseURL: "https://myapp.com",
			plugins: [
				oAuthProxy({
					productionURL: "https://login.myapp.com",
				}),
			],
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
				},
			},
		});
		const res = await client.signIn.social(
			{
				provider: "google",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
			},
		);
		const state = new URL(res.url!).searchParams.get("state");
		await client.$fetch(`/callback/google?code=test&state=${state}`, {
			onError(context) {
				const location = context.response.headers.get("location");
				if (!location) {
					throw new Error("Location header not found");
				}
				expect(location).toContain(
					"https://myapp.com/api/auth/callback/google/oauth-proxy?callbackURL=%2Fdashboard",
				);
				// Should have profile parameter (passthrough mode)
				const profile = new URL(location).searchParams.get("profile");
				expect(profile).toBeTruthy();
			},
		});
	});

	it("should require state cookie if it's not in proxy url", async () => {
		const { client } = await getTestInstance({
			baseURL: "https://myapp.com",
			plugins: [
				oAuthProxy({
					productionURL: "https://myapp.com",
				}),
			],
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
				},
			},
		});
		const res = await client.signIn.social(
			{
				provider: "google",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
			},
		);
		const state = new URL(res.url!).searchParams.get("state");
		await client.$fetch(`/callback/google?code=test&state=${state}`, {
			onError(context) {
				const location = context.response.headers.get("location");
				if (!location) {
					throw new Error("Location header not found");
				}
				expect(location).toContain("state_mismatch");
			},
		});
	});

	it("shouldn't redirect to proxy url on same origin (with productionURL)", async () => {
		const { client, cookieSetter } = await getTestInstance({
			baseURL: "https://myapp.com",
			plugins: [
				oAuthProxy({
					productionURL: "https://myapp.com",
				}),
			],
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
				},
			},
		});
		const headers = new Headers();
		const res = await client.signIn.social(
			{
				provider: "google",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		);
		const state = new URL(res.url!).searchParams.get("state");
		await client.$fetch(`/callback/google?code=test&state=${state}`, {
			headers,
			onError(context) {
				const location = context.response.headers.get("location");
				if (!location) {
					throw new Error("Location header not found");
				}
				expect(location).not.toContain("/api/auth/callback/google/oauth-proxy");
				expect(location).toContain("/dashboard");
			},
		});
	});

	describe("stateless mode (cookie-based)", () => {
		it("should encrypt state package for cross-origin OAuth", async () => {
			const { client } = await getTestInstance({
				database: undefined, // Stateless mode
				plugins: [
					oAuthProxy({
						currentURL: "http://preview-localhost:3000",
					}),
				],
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
					},
				},
			});

			const res = await client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
				},
			);

			const state = new URL(res.url!).searchParams.get("state");
			expect(state).toBeTruthy();

			// State should be an encrypted package, not the original state
			// In stateless mode, the state parameter contains encrypted data
			expect(state!.length).toBeGreaterThan(50); // Encrypted data is longer
		});

		it("should handle OAuth callback with encrypted state package", async () => {
			const { client } = await getTestInstance({
				database: undefined, // Stateless mode
				plugins: [
					oAuthProxy({
						currentURL: "http://preview-localhost:3000",
					}),
				],
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
					},
				},
			});

			// Initiate sign-in
			const res = await client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
				},
			);

			const encryptedState = new URL(res.url!).searchParams.get("state");
			expect(encryptedState).toBeTruthy();

			// Simulate OAuth provider callback with encrypted state
			await client.$fetch(
				`/callback/google?code=test&state=${encryptedState}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						expect(location).toBeTruthy();

						// Should redirect to proxy callback with profile data
						expect(location).toContain("/callback/google/oauth-proxy");
						expect(location).toContain("callbackURL");
						expect(location).toContain("profile");
					},
				},
			);
		});

		it("should decrypt state package correctly", async () => {
			const { client, auth } = await getTestInstance({
				database: undefined, // Stateless mode
				plugins: [
					oAuthProxy({
						currentURL: "http://preview-localhost:3000",
					}),
				],
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
					},
				},
			});

			const { secret } = await auth.$context;

			// Perform OAuth flow to get encrypted state
			const res = await client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
				},
			);

			const encryptedState = new URL(res.url!).searchParams.get("state");
			expect(encryptedState).toBeTruthy();

			// Verify we can decrypt the compact state package
			const statePackage = await unpackCompactState(
				derivePurposeKey(secret, "oauth-proxy-package"),
				encryptedState!,
			);
			expect(statePackage).not.toBeNull();

			// Verify state package structure
			expect(statePackage).toHaveProperty("state");
			expect(statePackage).toHaveProperty("stateCookie");
			expect(statePackage).toHaveProperty("isOAuthProxy");
			expect(statePackage!.isOAuthProxy).toBe(true);
		});

		it("should seamlessly decrypt and handle legacy double-encrypted state packages for backward compatibility", async () => {
			const { client, auth } = await getTestInstance({
				database: undefined, // Stateless mode
				plugins: [
					oAuthProxy({
						currentURL: "http://preview-localhost:3000",
					}),
				],
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
					},
				},
			});

			const { secret } = await auth.$context;

			// Create a legacy double-encrypted state package
			const originalState = "legacy-original-state-12345678";
			const plaintextState = JSON.stringify({
				callbackURL:
					"http://preview-localhost:3000/api/auth/callback/google/oauth-proxy?callbackURL=%2Fdashboard",
				codeVerifier: "legacy-code-verifier-12345",
				expiresAt: Date.now() + 600000,
				oauthState: originalState,
			});

			const stateCookie = await symmetricEncrypt({
				key: derivePurposeKey(secret, "oauth-proxy-state"),
				data: plaintextState,
			});
			const legacyStatePackage = {
				state: originalState,
				stateCookie,
				isOAuthProxy: true,
			};
			const legacyEncryptedPackage = await symmetricEncrypt({
				key: derivePurposeKey(secret, "oauth-proxy-package"),
				data: JSON.stringify(legacyStatePackage),
			});

			// Verify production callback accepts the legacy encrypted state
			await client.$fetch(
				`/callback/google?code=test&state=${legacyEncryptedPackage}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						expect(location).toBeTruthy();
						expect(location).toContain("/callback/google/oauth-proxy");
						expect(location).toContain("profile=");
					},
				},
			);
		});

		/**
		 * @see https://github.com/better-auth/better-auth/issues/9408
		 */
		it("produces compact state parameter for Twitter (X) with length <= 500 and completes OAuth flow", async () => {
			const { client, auth } = await getTestInstance({
				database: undefined, // Stateless mode
				plugins: [
					oAuthProxy({
						currentURL: "http://preview-localhost:3000",
					}),
				],
				socialProviders: {
					twitter: {
						clientId: "twitter-client-id",
						clientSecret: "twitter-client-secret",
					},
				},
			});

			// 1. Sign-in redirect generates compact state
			const res = await client.signIn.social(
				{
					provider: "twitter",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
				},
			);

			const twitterAuthURL = new URL(res.url!);
			const state = twitterAuthURL.searchParams.get("state");
			expect(state).toBeTruthy();

			// Assert Twitter state ceiling: must be <= 500 chars (Issue #9408)
			expect(state!.length).toBeLessThanOrEqual(500);

			// Assert preview unpacks the compact state package correctly
			const { secret } = await auth.$context;
			const unpacked = await unpackCompactState(
				derivePurposeKey(secret, "oauth-proxy-package"),
				state!,
			);
			expect(unpacked).not.toBeNull();
			expect(unpacked!.isOAuthProxy).toBe(true);

			// 2. Production callback handles the authorization code and redirects with profile
			let previewRedirectLocation: string | null = null;
			await client.$fetch(`/callback/twitter?code=test-code&state=${state}`, {
				onError(context) {
					previewRedirectLocation = context.response.headers.get("location");
				},
			});

			expect(previewRedirectLocation).toBeTruthy();
			expect(previewRedirectLocation).toContain(
				"http://preview-localhost:3000/api/auth/callback/twitter/oauth-proxy",
			);
			expect(previewRedirectLocation).toContain("profile=");
		});

		it("unpackCompactState safely handles malformed, truncated, and corrupted payloads", async () => {
			const secret = "test-secret-key-32-bytes-long!!";

			// Invalid base64
			const invalidBase64 = await unpackCompactState(
				secret,
				"ba_c.invalid@@@not-base64",
			);
			expect(invalidBase64).toBeNull();

			// Truncated ciphertext (< 40 bytes)
			const truncated = await unpackCompactState(secret, "ba_c.dHJ1bmNhdGVk");
			expect(truncated).toBeNull();

			// Valid payload packed then corrupted
			const validPayload = {
				state: "test-state-12345",
				stateCookie: JSON.stringify({
					callbackURL: "/dashboard",
					codeVerifier: "code-verifier",
					expiresAt: Date.now() + 60000,
				}),
				isOAuthProxy: true,
			};
			const packed = await packCompactState(secret, validPayload);
			expect(packed.startsWith("ba_c.")).toBe(true);

			// Corrupt payload bytes
			const corrupted = `ba_c.${packed.slice(5, 20)}XXXX${packed.slice(24)}`;
			const unpackedCorrupted = await unpackCompactState(secret, corrupted);
			expect(unpackedCorrupted).toBeNull();
		});

		it("unpackCompactState safely handles SecretConfig with versioned envelope and legacy fallback", async () => {
			const v1Secret = "version-1-secret-32-bytes-long!";
			const v2Secret = "version-2-secret-32-bytes-long!";
			const legacySecret = "legacy-secret-32-bytes-long!!!!";

			const secretConfig: SecretConfig = {
				currentVersion: 2,
				keys: new Map([
					[1, v1Secret],
					[2, v2Secret],
				]),
				legacySecret,
			};

			const validPayload = {
				state: "secret-config-state",
				stateCookie: JSON.stringify({
					callbackURL: "/dashboard",
					codeVerifier: "code-verifier-v2",
					expiresAt: Date.now() + 60000,
				}),
				isOAuthProxy: true,
			};

			// 1. Packed with v2 (current version) -> unpacked with SecretConfig
			const packedV2 = await packCompactState(secretConfig, validPayload);
			const unpackedV2 = await unpackCompactState(secretConfig, packedV2);
			expect(unpackedV2).not.toBeNull();
			expect(unpackedV2?.state).toBe("secret-config-state");

			// 2. Packed with v1 -> unpacked with SecretConfig containing v1
			const v1Config: SecretConfig = {
				currentVersion: 1,
				keys: new Map([[1, v1Secret]]),
			};
			const packedV1 = await packCompactState(v1Config, validPayload);
			const unpackedV1 = await unpackCompactState(secretConfig, packedV1);
			expect(unpackedV1).not.toBeNull();
			expect(unpackedV1?.state).toBe("secret-config-state");

			// 3. Packed with raw legacy secret (no version envelope) -> unpacked via legacySecret fallback
			const packedLegacy = await packCompactState(legacySecret, validPayload);
			const unpackedLegacy = await unpackCompactState(
				secretConfig,
				packedLegacy,
			);
			expect(unpackedLegacy).not.toBeNull();
			expect(unpackedLegacy?.state).toBe("secret-config-state");

			// 4. Missing version in keys returns null safely
			const unknownVersionConfig: SecretConfig = {
				currentVersion: 99,
				keys: new Map([[99, "other-secret-key-32-bytes-long!"]]),
			};
			const packedV99 = await packCompactState(
				unknownVersionConfig,
				validPayload,
			);
			const unpackedMissingVersion = await unpackCompactState(
				secretConfig,
				packedV99,
			);
			expect(unpackedMissingVersion).toBeNull();
		});

		it("round-trips payload within 64 KB decompression limit and rejects payload exceeding 64 KB", async () => {
			const secret = "test-secret-key-32-bytes-long!!";

			// 1. Payload expanding to ~60 KB (< 64 KB) packs and unpacks cleanly
			const withinLimitPayload = {
				state: "state-within-limit",
				stateCookie: JSON.stringify({
					callbackURL: "/dashboard",
					codeVerifier: "code-verifier-60kb",
					expiresAt: Date.now() + 60000,
					serverContext: {
						padding: "a".repeat(60 * 1024),
					},
				}),
				isOAuthProxy: true,
			};
			const packedWithin = await packCompactState(secret, withinLimitPayload);
			const unpackedWithin = await unpackCompactState(secret, packedWithin);
			expect(unpackedWithin).not.toBeNull();
			expect(unpackedWithin?.state).toBe("state-within-limit");
			expect(unpackedWithin?.stateCookie).toBe(withinLimitPayload.stateCookie);

			// 2. Payload expanding to > 64 KB (~70 KB) returns null safely without hanging
			const oversizedPayload = {
				state: "state-oversized",
				stateCookie: JSON.stringify({
					callbackURL: "/dashboard",
					codeVerifier: "code-verifier-70kb",
					expiresAt: Date.now() + 60000,
					serverContext: {
						padding: "a".repeat(70 * 1024),
					},
				}),
				isOAuthProxy: true,
			};
			const packedOversized = await packCompactState(secret, oversizedPayload);
			const unpackedOversized = await unpackCompactState(
				secret,
				packedOversized,
			);
			expect(unpackedOversized).toBeNull();
		});

		it("supports node:zlib fallback when CompressionStream / DecompressionStream are unavailable", async () => {
			const secret = "test-secret-key-32-bytes-long!!";
			const originalCS = globalThis.CompressionStream;
			const originalDS = globalThis.DecompressionStream;

			try {
				// Simulate runtime without web streams (e.g. Node 16)
				// @ts-expect-error simulating runtime without CompressionStream
				globalThis.CompressionStream = undefined;
				// @ts-expect-error simulating runtime without DecompressionStream
				globalThis.DecompressionStream = undefined;

				const payload = {
					state: "zlib-fallback-state",
					stateCookie: JSON.stringify({
						callbackURL: "/dashboard",
						codeVerifier: "code-verifier-zlib",
						expiresAt: Date.now() + 60000,
						serverContext: {
							padding: "z".repeat(10 * 1024),
						},
					}),
					isOAuthProxy: true,
				};

				const packed = await packCompactState(secret, payload);
				expect(packed.startsWith("ba_c.")).toBe(true);

				const unpacked = await unpackCompactState(secret, packed);
				expect(unpacked).not.toBeNull();
				expect(unpacked?.state).toBe("zlib-fallback-state");

				// Oversized payload through zlib fallback returns null safely
				const oversized = {
					state: "zlib-oversized",
					stateCookie: JSON.stringify({
						callbackURL: "/dashboard",
						codeVerifier: "code-verifier-zlib-oversized",
						expiresAt: Date.now() + 60000,
						serverContext: {
							padding: "z".repeat(70 * 1024),
						},
					}),
					isOAuthProxy: true,
				};
				const packedOversized = await packCompactState(secret, oversized);
				const unpackedOversized = await unpackCompactState(
					secret,
					packedOversized,
				);
				expect(unpackedOversized).toBeNull();
			} finally {
				globalThis.CompressionStream = originalCS;
				globalThis.DecompressionStream = originalDS;
			}
		});

		it("should work on same origin without proxy", async () => {
			const { client, cookieSetter } = await getTestInstance({
				database: undefined, // Stateless mode
				plugins: [
					oAuthProxy({
						productionURL: "http://localhost:3000",
					}),
				],
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
					},
				},
			});

			const headers = new Headers();
			const res = await client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
					onSuccess: cookieSetter(headers),
				},
			);

			const state = new URL(res.url!).searchParams.get("state");

			// On same origin, state should NOT be encrypted package
			// It should be the regular random state
			expect(state!.length).toBeLessThan(50);

			await client.$fetch(`/callback/google?code=test&state=${state}`, {
				headers,
				onError(context) {
					const location = context.response.headers.get("location");

					// Should NOT redirect to proxy
					expect(location).not.toContain("/callback/google/oauth-proxy");
					expect(location).toContain("/dashboard");
				},
			});
		});
	});

	describe("passthrough mode", () => {
		it("should include profile data in passthrough payload", async () => {
			const { client, auth } = await getTestInstance({
				plugins: [
					oAuthProxy({
						currentURL: "http://preview.example.com",
					}),
				],
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
					},
				},
			});

			const { secret } = await auth.$context;

			const res = await client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
				},
			);

			const state = new URL(res.url!).searchParams.get("state");

			let encryptedProfile: string | null = null;
			await client.$fetch(`/callback/google?code=test&state=${state}`, {
				onError(context) {
					const location = context.response.headers.get("location");
					if (location && location.includes("profile=")) {
						const url = new URL(location);
						encryptedProfile = url.searchParams.get("profile");
					}
				},
			});

			expect(encryptedProfile).toBeTruthy();

			// Decrypt and verify profile data
			const decrypted = await symmetricDecrypt({
				key: derivePurposeKey(secret, "oauth-proxy-profile"),
				data: encryptedProfile!,
			});
			const payload = parseJSON<{
				userInfo: {
					id: string;
					email: string;
					name?: string;
					emailVerified: boolean;
				};
				account: {
					providerId: string;
					issuer: string;
					accountId: string;
					accessToken?: string;
					refreshToken?: string;
				};
				state: string;
				callbackURL: string;
				timestamp: number;
			}>(decrypted);

			expect(payload.userInfo).toBeDefined();
			expect(payload.userInfo.email).toBe("user@email.com");
			expect(payload.account).toBeDefined();
			expect(payload.account.providerId).toBe("google");
			expect(payload.account.accountId).toBe("1234567890");
			expect(payload.state).toBeDefined();
			expect(payload.timestamp).toBeDefined();
		});

		/**
		 * Cookie strategy with a dedicated proxy `secret` that differs from
		 * `BETTER_AUTH_SECRET`. The `oauth_state` cookie is encrypted with the
		 * environment secret, so the proxy must re-encrypt it with the proxy key
		 * for the production callback to recover the inner state. Without that,
		 * the callback fails to decrypt the state package and produces no
		 * passthrough profile.
		 *
		 * @see https://github.com/better-auth/better-auth/pull/9385
		 */
		it("recovers cookie-strategy state when the proxy secret differs from the env secret", async () => {
			const { client } = await getTestInstance({
				secret: "env-secret-not-shared",
				account: { storeStateStrategy: "cookie" },
				plugins: [
					oAuthProxy({
						currentURL: "http://preview.example.com",
						secret: "shared-proxy-secret",
					}),
				],
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
					},
				},
			});

			const res = await client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
				},
			);
			const state = new URL(res.url!).searchParams.get("state");

			let encryptedProfile: string | null = null;
			await client.$fetch(`/callback/google?code=test&state=${state}`, {
				onError(context) {
					const location = context.response.headers.get("location");
					if (location?.includes("profile=")) {
						encryptedProfile = new URL(location).searchParams.get("profile");
					}
				},
			});

			expect(encryptedProfile).toBeTruthy();
		});

		it("should create user/session on preview from profile data", async () => {
			// Production instance - handles OAuth callback
			const production = await getTestInstance(
				{
					baseURL: "http://localhost:3000",
					plugins: [oAuthProxy()],
					socialProviders: {
						google: {
							clientId: "test",
							clientSecret: "test",
						},
					},
				},
				{
					disableTestUser: true,
				},
			);

			// Preview instance with SEPARATE database
			const preview = await getTestInstance(
				{
					baseURL: "http://preview.example.com",
					plugins: [
						oAuthProxy({
							productionURL: "http://localhost:3000",
						}),
					],
					socialProviders: {
						google: {
							clientId: "test",
							clientSecret: "test",
						},
					},
				},
				{
					disableTestUser: true,
				},
			);

			// Step 1: Start OAuth on preview
			const res = await preview.client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
				},
			);

			const state = new URL(res.url!).searchParams.get("state");

			// Step 2: Complete OAuth callback on production - passthrough mode
			let encryptedProfile: string | null = null;
			let callbackURL: string | null = null;
			await production.client.$fetch(
				`/callback/google?code=test&state=${state}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						if (location && location.includes("profile=")) {
							const url = new URL(location);
							encryptedProfile = url.searchParams.get("profile");
							callbackURL = url.searchParams.get("callbackURL");
						}
					},
				},
			);

			expect(encryptedProfile).toBeTruthy();

			// Verify production DB is EMPTY (passthrough doesn't create user on production)
			const productionCtx = await production.auth.$context;
			const productionUsers = await productionCtx.internalAdapter.listUsers();
			expect(productionUsers.length).toBe(0);

			// Verify preview DB is empty before proxy callback
			const previewCtx = await preview.auth.$context;
			const previewUsersBefore = await previewCtx.internalAdapter.listUsers();
			expect(previewUsersBefore.length).toBe(0);

			// Step 3: Call oauth-proxy-callback on preview instance
			await preview.client.$fetch(
				`/oauth-proxy-callback?callbackURL=${encodeURIComponent(callbackURL!)}&profile=${encodeURIComponent(encryptedProfile!)}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						expect(location).toContain("/dashboard");
					},
				},
			);

			// Step 4: Verify user was created ONLY in preview DB
			const previewUsersAfter = await previewCtx.internalAdapter.listUsers();
			expect(previewUsersAfter.length).toBe(1);
			expect(previewUsersAfter[0]?.email).toBe("user@email.com");

			// Verify account was created
			const previewAccounts = await previewCtx.internalAdapter.findAccounts(
				previewUsersAfter[0]!.id,
			);
			expect(previewAccounts.length).toBe(1);
			expect(previewAccounts[0]?.providerId).toBe("google");

			// Verify session was created
			const previewSessions = await previewCtx.internalAdapter.listSessions(
				previewUsersAfter[0]!.id,
			);
			expect(previewSessions.length).toBe(1);
		});

		/**
		 * @see https://github.com/better-auth/better-auth/issues/10562
		 */
		it("runs callback hooks with restored OAuth state", async () => {
			const production = await getTestInstance(
				{
					baseURL: "http://localhost:3000",
					plugins: [oAuthProxy()],
					socialProviders: {
						google: {
							clientId: "test",
							clientSecret: "test",
						},
					},
				},
				{ disableTestUser: true },
			);
			const onCallback = vi.fn();
			const preview = await getTestInstance(
				{
					baseURL: "http://preview.example.com",
					hooks: {
						before: createAuthMiddleware(async (ctx) => {
							if (ctx.path !== "/sign-in/social") return;
							await addOAuthServerContext({ callbackObserver: true });
						}),
						after: createAuthMiddleware(async (ctx) => {
							if (!ctx.path?.startsWith("/callback")) return;
							const oauthState = await getOAuthState();
							onCallback({
								newSession: ctx.context.newSession !== null,
								path: ctx.path,
								providerId: ctx.params?.id,
								serverContext: oauthState?.serverContext,
							});
						}),
					},
					plugins: [
						oAuthProxy({
							productionURL: "http://localhost:3000",
						}),
					],
					socialProviders: {
						google: {
							clientId: "test",
							clientSecret: "test",
						},
					},
				},
				{ disableTestUser: true },
			);

			const response = await preview.client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{ throw: true },
			);
			const state = new URL(response.url!).searchParams.get("state");

			const proxyCallback: { url: URL | null } = { url: null };
			await production.client.$fetch(
				`/callback/google?code=test&state=${state}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						if (location?.includes("profile=")) {
							proxyCallback.url = new URL(location);
						}
					},
				},
			);

			if (!proxyCallback.url) {
				throw new Error("OAuth proxy callback URL was not returned");
			}
			const proxyCallbackURL = proxyCallback.url;
			const proxyCallbackPath = `${proxyCallbackURL.pathname.replace(
				"/api/auth",
				"",
			)}${proxyCallbackURL.search}`;
			await preview.client.$fetch(proxyCallbackPath, {
				onError(context) {
					expect(context.response.headers.get("location")).toContain(
						"/dashboard",
					);
				},
			});

			expect(onCallback).toHaveBeenCalledExactlyOnceWith({
				newSession: true,
				path: "/callback/:id/oauth-proxy",
				providerId: "google",
				serverContext: { callbackObserver: true },
			});
		});

		/**
		 * @see https://github.com/better-auth/better-auth/issues/10562
		 */
		it("rejects mismatched callback providers", async () => {
			const production = await getTestInstance(
				{
					baseURL: "http://localhost:3000",
					plugins: [oAuthProxy()],
					socialProviders: {
						google: {
							clientId: "test",
							clientSecret: "test",
						},
					},
				},
				{ disableTestUser: true },
			);
			const preview = await getTestInstance(
				{
					baseURL: "http://preview.example.com",
					plugins: [
						oAuthProxy({
							productionURL: "http://localhost:3000",
						}),
					],
					socialProviders: {
						google: {
							clientId: "test",
							clientSecret: "test",
						},
					},
				},
				{ disableTestUser: true },
			);
			const response = await preview.client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{ throw: true },
			);
			const state = new URL(response.url!).searchParams.get("state");

			const proxyCallback: { url: URL | null } = { url: null };
			await production.client.$fetch(
				`/callback/google?code=test&state=${state}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						if (location?.includes("profile=")) {
							proxyCallback.url = new URL(location);
						}
					},
				},
			);

			if (!proxyCallback.url) {
				throw new Error("OAuth proxy callback URL was not returned");
			}
			const proxyCallbackURL = proxyCallback.url;
			const mismatchedCallbackPath = `${proxyCallbackURL.pathname
				.replace("/api/auth", "")
				.replace("/callback/google/", "/callback/github/")}${
				proxyCallbackURL.search
			}`;
			const errorRedirect: { location: string | null } = { location: null };
			await preview.client.$fetch(mismatchedCallbackPath, {
				onError(context) {
					errorRedirect.location = context.response.headers.get("location");
				},
			});

			if (!errorRedirect.location) {
				throw new Error("OAuth proxy error redirect was not returned");
			}
			expect(new URL(errorRedirect.location).searchParams.get("error")).toBe(
				"provider_mismatch",
			);
			const previewContext = await preview.auth.$context;
			expect(await previewContext.internalAdapter.listUsers()).toHaveLength(0);
		});

		it("should forward result.error verbatim instead of collapsing to user_creation_failed", async () => {
			const production = await getTestInstance(
				{
					baseURL: "http://localhost:3000",
					plugins: [oAuthProxy()],
					socialProviders: {
						google: {
							clientId: "test",
							clientSecret: "test",
							disableSignUp: true,
						},
					},
				},
				{ disableTestUser: true },
			);

			const preview = await getTestInstance(
				{
					baseURL: "http://preview.example.com",
					plugins: [
						oAuthProxy({
							productionURL: "http://localhost:3000",
						}),
					],
					socialProviders: {
						google: {
							clientId: "test",
							clientSecret: "test",
						},
					},
				},
				{ disableTestUser: true },
			);

			const res = await preview.client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{ throw: true },
			);
			const state = new URL(res.url!).searchParams.get("state");

			let encryptedProfile: string | null = null;
			let callbackURL: string | null = null;
			await production.client.$fetch(
				`/callback/google?code=test&state=${state}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						if (location && location.includes("profile=")) {
							const url = new URL(location);
							encryptedProfile = url.searchParams.get("profile");
							callbackURL = url.searchParams.get("callbackURL");
						}
					},
				},
			);
			expect(encryptedProfile).toBeTruthy();

			let proxyRedirect: string | null = null;
			await preview.client.$fetch(
				`/oauth-proxy-callback?callbackURL=${encodeURIComponent(callbackURL!)}&profile=${encodeURIComponent(encryptedProfile!)}`,
				{
					onError(context) {
						proxyRedirect = context.response.headers.get("location");
					},
				},
			);
			expect(proxyRedirect).toBeTruthy();
			const url = new URL(proxyRedirect!);
			expect(url.searchParams.get("error")).toBe("signup_disabled");
		});

		it("should reject expired profile payloads", async () => {
			const { client, auth } = await getTestInstance({
				plugins: [
					oAuthProxy({
						currentURL: "http://preview.example.com",
						maxAge: 60, // 60 seconds
					}),
				],
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
					},
				},
			});
			const { secret } = await auth.$context;

			// Create expired profile payload
			const payload = {
				userInfo: {
					id: "123",
					email: "user@email.com",
					name: "Test User",
					emailVerified: true,
				},
				account: {
					providerId: "google",
					accountId: "123",
					accessToken: "test",
				},
				state: "test-state",
				callbackURL: "/dashboard",
				timestamp: Date.now() - 120000, // 2 minutes ago
			};

			const encryptedProfile = await symmetricEncrypt({
				key: derivePurposeKey(secret, "oauth-proxy-profile"),
				data: JSON.stringify(payload),
			});

			await client.$fetch(
				`/oauth-proxy-callback?callbackURL=%2Fdashboard&profile=${encryptedProfile}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						expect(location).toContain("error=payload_expired");
					},
				},
			);
		});

		it("should use custom maxAge setting", async () => {
			const { client, auth } = await getTestInstance({
				plugins: [
					oAuthProxy({
						currentURL: "http://preview.example.com",
						maxAge: 5, // 5 seconds
					}),
				],
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
					},
				},
			});
			const { secret } = await auth.$context;

			// Create payload that's 10 seconds old (older than maxAge of 5)
			const payload = {
				userInfo: {
					id: "123",
					email: "user@email.com",
					name: "Test User",
					emailVerified: true,
				},
				account: {
					providerId: "google",
					accountId: "123",
					accessToken: "test",
				},
				state: "test-state",
				callbackURL: "/dashboard",
				timestamp: Date.now() - 10000, // 10 seconds ago
			};

			const encryptedProfile = await symmetricEncrypt({
				key: derivePurposeKey(secret, "oauth-proxy-profile"),
				data: JSON.stringify(payload),
			});

			await client.$fetch(
				`/oauth-proxy-callback?callbackURL=%2Fdashboard&profile=${encryptedProfile}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						expect(location).toContain("error=payload_expired");
					},
				},
			);
		});

		it("should work with database mode + UUID", async () => {
			// This tests the scenario where:
			// - storeStateStrategy is "database" (not cookie)
			// - generateId: "uuid" is configured
			// Passthrough mode should work without any issues
			const { client, auth } = await getTestInstance(
				{
					plugins: [
						oAuthProxy({
							currentURL: "http://preview.example.com",
						}),
					],
					socialProviders: {
						google: {
							clientId: "test",
							clientSecret: "test",
						},
					},
					advanced: {
						database: {
							generateId: "uuid",
						},
					},
				},
				{
					testWith: "postgres",
				},
			);

			const { secret } = await auth.$context;

			// Start OAuth flow
			const res = await client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
				},
			);

			const state = new URL(res.url!).searchParams.get("state");

			// Complete OAuth callback - this should work without UUID format errors
			let encryptedProfile: string | null = null;
			await client.$fetch(`/callback/google?code=test&state=${state}`, {
				onError(context) {
					const location = context.response.headers.get("location");
					if (location && location.includes("profile=")) {
						const url = new URL(location);
						encryptedProfile = url.searchParams.get("profile");
					}
				},
			});

			expect(encryptedProfile).toBeTruthy();

			// Verify profile data structure
			const decrypted = await symmetricDecrypt({
				key: derivePurposeKey(secret, "oauth-proxy-profile"),
				data: encryptedProfile!,
			});
			const payload = parseJSON<{
				userInfo: unknown;
				account: {
					providerId: string;
				};
			}>(decrypted);

			expect(payload.userInfo).toBeDefined();
			expect(payload.account).toBeDefined();
			expect(payload.account.providerId).toBe("google");
		});

		it("should reject payloads with missing required fields", async () => {
			const { client, auth } = await getTestInstance({
				plugins: [
					oAuthProxy({
						currentURL: "http://preview.example.com",
					}),
				],
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
					},
				},
			});
			const { secret } = await auth.$context;
			const validPayload = {
				userInfo: {
					id: "123",
					email: "user@email.com",
					name: "Test User",
					emailVerified: true,
				},
				account: {
					providerId: "google",
					accountId: "123",
					accessToken: "test",
				},
				state: "test-state",
				callbackURL: "/dashboard",
				timestamp: Date.now(),
			};
			const expectInvalidPayload = async (payload: unknown) => {
				const encryptedPayload = await symmetricEncrypt({
					key: derivePurposeKey(secret, "oauth-proxy-profile"),
					data: JSON.stringify(payload),
				});
				await client.$fetch(
					`/oauth-proxy-callback?callbackURL=%2Fdashboard&profile=${encryptedPayload}`,
					{
						onError(context) {
							const location = context.response.headers.get("location");
							expect(location).toContain("error=invalid_payload");
						},
					},
				);
			};

			await expectInvalidPayload(null);
			await expectInvalidPayload({ ...validPayload, callbackURL: "" });
			await expectInvalidPayload({ ...validPayload, state: "" });
			await expectInvalidPayload({ ...validPayload, timestamp: undefined });
			await expectInvalidPayload({ ...validPayload, userInfo: undefined });
			await expectInvalidPayload({
				...validPayload,
				timestamp: "not-a-number",
			});
		});

		it("should use dedicated secret instead of global secret", async () => {
			const dedicatedSecret = "oauth-proxy-dedicated-secret-key";

			const production = await getTestInstance(
				{
					baseURL: "http://localhost:3000",
					plugins: [
						oAuthProxy({
							secret: dedicatedSecret,
						}),
					],
					socialProviders: {
						google: {
							clientId: "test",
							clientSecret: "test",
						},
					},
				},
				{
					disableTestUser: true,
				},
			);

			const preview = await getTestInstance(
				{
					baseURL: "http://preview.example.com",
					plugins: [
						oAuthProxy({
							productionURL: "http://localhost:3000",
							secret: dedicatedSecret,
						}),
					],
					socialProviders: {
						google: {
							clientId: "test",
							clientSecret: "test",
						},
					},
				},
				{
					disableTestUser: true,
				},
			);

			// Step 1: Start OAuth on preview
			const res = await preview.client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
				},
			);

			const state = new URL(res.url!).searchParams.get("state");

			// Step 2: Complete OAuth callback on production
			let encryptedProfile: string | null = null;
			let callbackURL: string | null = null;
			await production.client.$fetch(
				`/callback/google?code=test&state=${state}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						if (location && location.includes("profile=")) {
							const url = new URL(location);
							encryptedProfile = url.searchParams.get("profile");
							callbackURL = url.searchParams.get("callbackURL");
						}
					},
				},
			);

			expect(encryptedProfile).toBeTruthy();

			// Verify: encrypted with dedicated secret, NOT with global secret
			const decryptedWithDedicated = await symmetricDecrypt({
				key: derivePurposeKey(dedicatedSecret, "oauth-proxy-profile"),
				data: encryptedProfile!,
			});
			expect(decryptedWithDedicated).toContain("user@email.com");

			const { secret: globalSecret } = await production.auth.$context;
			await expect(
				symmetricDecrypt({
					key: globalSecret,
					data: encryptedProfile!,
				}),
			).rejects.toThrow();

			// Step 3: Preview can decrypt and create user
			await preview.client.$fetch(
				`/oauth-proxy-callback?callbackURL=${encodeURIComponent(callbackURL!)}&profile=${encodeURIComponent(encryptedProfile!)}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						expect(location).toContain("/dashboard");
					},
				},
			);

			const previewCtx = await preview.auth.$context;
			const users = await previewCtx.internalAdapter.listUsers();
			expect(users.length).toBe(1);
			expect(users[0]?.email).toBe("user@email.com");
			const accounts = await previewCtx.internalAdapter.findAccounts(
				users[0]!.id,
			);
			expect(accounts).toContainEqual(
				expect.objectContaining({
					providerId: "google",
					accountId: "1234567890",
				}),
			);
		});

		it("should reject a profile payload whose OAuth state was never issued", async () => {
			// Preview instance
			const preview = await getTestInstance(
				{
					baseURL: "http://preview.example.com",
					plugins: [oAuthProxy()],
					socialProviders: {
						google: {
							clientId: "test",
							clientSecret: "test",
						},
					},
				},
				{
					disableTestUser: true,
				},
			);

			const previewCtx = await preview.auth.$context;
			const { secret } = previewCtx;

			// Pre-create user in preview DB
			await previewCtx.internalAdapter.createUser(
				{
					id: "existing-user-id",
					email: "user@email.com",
					name: "Existing User",
					emailVerified: true,
				},
				{ method: "test" },
			);

			// Create profile payload for the SAME email
			const payload = {
				userInfo: {
					id: "google-user-id",
					email: "user@email.com",
					name: "New Name",
					emailVerified: true,
				},
				account: {
					providerId: "google",
					accountId: "google-user-id",
					accessToken: "test123",
				},
				state: "test-state",
				callbackURL: "/dashboard",
				timestamp: Date.now(),
			};

			const encrypted = await symmetricEncrypt({
				key: derivePurposeKey(secret, "oauth-proxy-profile"),
				data: JSON.stringify(payload),
			});

			await preview.client.$fetch(
				`/oauth-proxy-callback?callbackURL=/dashboard&profile=${encodeURIComponent(encrypted)}`,
				{
					onError(context) {
						expect(context.response.status).toBe(302);
						const location = context.response.headers.get("location");
						expect(location).toContain("error=state_mismatch");
					},
				},
			);

			const users = await previewCtx.internalAdapter.listUsers();
			expect(users.length).toBe(1);
			expect(users[0]?.email).toBe("user@email.com");

			const accounts = await previewCtx.internalAdapter.findAccounts(
				users[0]!.id,
			);
			expect(accounts.length).toBe(0);
		});
	});

	/**
	 *
	 * Tests that oauth-proxy-callback correctly skips the state cookie check
	 * when cleaning up OAuth state. In the proxy flow:
	 * 1. User starts OAuth on preview - state cookie set on preview domain
	 * 2. OAuth provider redirects to production
	 * 3. Production redirects to preview's oauth-proxy-callback
	 * 4. parseGenericState is called to clean up, but the state cookie
	 *    may not be present (cross-origin redirect) or may not match
	 *
	 * The fix is to pass `skipStateCookieCheck: true` when calling parseGenericState
	 * in the oauth-proxy-callback endpoint.
	 */
	describe("database mode state cleanup", () => {
		it("should not fail when state cookie is missing during proxy callback cleanup", async () => {
			// This test simulates the scenario where:
			// - Both preview and production share the SAME database
			// - State storage is "database" (default)
			// - The state cookie was set on preview, but when oauth-proxy-callback
			//   is called, the cookie may not be present

			// Use a shared database for both instances
			const { client: productionClient, auth: productionAuth } =
				await getTestInstance(
					{
						baseURL: "http://localhost:3000",
						plugins: [
							oAuthProxy({
								currentURL: "http://preview.example.com",
								productionURL: "http://localhost:3000",
							}),
						],
						socialProviders: {
							google: {
								clientId: "test",
								clientSecret: "test",
							},
						},
					},
					{
						disableTestUser: true,
					},
				);

			// Step 1: Initiate OAuth flow
			const res = await productionClient.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
				},
			);

			const state = new URL(res.url!).searchParams.get("state");

			// Step 2: Complete OAuth callback to get encrypted profile
			let encryptedProfile: string | null = null;
			let callbackURL: string | null = null;
			await productionClient.$fetch(
				`/callback/google?code=test&state=${state}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						if (location && location.includes("profile=")) {
							const url = new URL(location);
							encryptedProfile = url.searchParams.get("profile");
							callbackURL = url.searchParams.get("callbackURL");
						}
					},
				},
			);

			expect(encryptedProfile).toBeTruthy();
			expect(callbackURL).toBeTruthy();

			// Step 3: Call oauth-proxy-callback WITHOUT cookies (simulating cross-origin)
			// This is the key: we explicitly DON'T pass any cookies/headers
			// to simulate the state cookie not being present
			const _response = await productionClient.$fetch(
				`/oauth-proxy-callback?callbackURL=${encodeURIComponent(callbackURL!)}&profile=${encodeURIComponent(encryptedProfile!)}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						// The callback should succeed and redirect to dashboard
						// NOT fail with state_mismatch error
						expect(location).not.toContain("error=");
						expect(location).toContain("/dashboard");
					},
				},
			);

			// Verify user was created successfully
			const ctx = await productionAuth.$context;
			const users = await ctx.internalAdapter.listUsers();
			expect(users.length).toBe(1);
			expect(users[0]?.email).toBe("user@email.com");
		});

		it("should reject the callback when the OAuth state is not found in the database", async () => {
			const { client, auth } = await getTestInstance(
				{
					plugins: [
						oAuthProxy({
							currentURL: "http://preview.example.com",
						}),
					],
					socialProviders: {
						google: {
							clientId: "test",
							clientSecret: "test",
						},
					},
				},
				{
					disableTestUser: true,
				},
			);

			const { secret, internalAdapter } = await auth.$context;

			// Create a valid payload with a state that doesn't exist in DB
			const payload = {
				userInfo: {
					id: "123",
					email: "test@email.com",
					name: "Test User",
					emailVerified: true,
				},
				account: {
					providerId: "google",
					accountId: "123",
					accessToken: "test",
				},
				state: "non-existent-state-id",
				callbackURL: "/dashboard",
				timestamp: Date.now(),
			};

			const encryptedProfile = await symmetricEncrypt({
				key: derivePurposeKey(secret, "oauth-proxy-profile"),
				data: JSON.stringify(payload),
			});

			await client.$fetch(
				`/oauth-proxy-callback?callbackURL=/dashboard&profile=${encodeURIComponent(encryptedProfile)}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						expect(location).toContain("error=state_mismatch");
					},
				},
			);

			const users = await internalAdapter.listUsers();
			expect(users.length).toBe(0);
		});
	});

	/**
	 * Tests for secret configuration across environments.
	 * When production and preview have different BETTER_AUTH_SECRET values,
	 * a shared `secret` must be configured in the oAuthProxy options.
	 */
	describe("secret configuration", () => {
		/**
		 * This test verifies that when production and preview have DIFFERENT secrets
		 * (without a shared oAuthProxy secret configured), the callback fails because
		 * the before hook can't decrypt the state package.
		 *
		 * This is the root cause of the issue where users see:
		 * "ERROR [Better Auth]: Failed to parse state BetterAuthError: State mismatch: State not persisted correctly"
		 */
		it("should fail when preview and production have different secrets (no shared secret)", async () => {
			// Preview instance with its own secret
			const preview = await getTestInstance(
				{
					baseURL: "http://preview.example.com",
					secret: "preview-secret-key-that-is-different",
					plugins: [
						oAuthProxy({
							productionURL: "http://localhost:3000",
							// Note: NO shared secret configured - this is the problem
						}),
					],
					socialProviders: {
						google: {
							clientId: "test",
							clientSecret: "test",
						},
					},
				},
				{
					disableTestUser: true,
				},
			);

			// Production instance with a DIFFERENT secret
			const production = await getTestInstance(
				{
					baseURL: "http://localhost:3000",
					secret: "production-secret-key-that-is-different",
					plugins: [
						oAuthProxy({
							// Note: NO shared secret configured
						}),
					],
					socialProviders: {
						google: {
							clientId: "test",
							clientSecret: "test",
						},
					},
				},
				{
					disableTestUser: true,
				},
			);

			// Step 1: Start OAuth on preview
			const res = await preview.client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
				},
			);

			// The state is encrypted with preview's secret
			const encryptedState = new URL(res.url!).searchParams.get("state");
			expect(encryptedState).toBeTruthy();

			// Step 2: OAuth callback arrives at production
			// Production tries to decrypt with its own secret - THIS FAILS
			// The before hook catches the error and returns early
			// The regular callback handler runs and fails
			await production.client.$fetch(
				`/callback/google?code=test&state=${encryptedState}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						// Should fail with state error because regular callback runs
						expect(location).toMatch(/error=.*state|please_restart/i);
					},
				},
			);
		});

		/**
		 * This test verifies the CORRECT configuration: using a shared secret
		 * for the oauth-proxy plugin across all environments.
		 */
		it("should work correctly when a shared secret is configured", async () => {
			const sharedProxySecret = "shared-oauth-proxy-secret-for-all-envs";

			// Preview instance with shared proxy secret
			const preview = await getTestInstance(
				{
					baseURL: "http://preview.example.com",
					secret: "preview-main-secret", // Main secret can be different
					plugins: [
						oAuthProxy({
							productionURL: "http://localhost:3000",
							secret: sharedProxySecret, // SHARED secret for proxy
						}),
					],
					socialProviders: {
						google: {
							clientId: "test",
							clientSecret: "test",
						},
					},
				},
				{
					disableTestUser: true,
				},
			);

			// Production instance with the SAME shared proxy secret
			const production = await getTestInstance(
				{
					baseURL: "http://localhost:3000",
					secret: "production-main-secret", // Main secret can be different
					plugins: [
						oAuthProxy({
							secret: sharedProxySecret, // SAME shared secret for proxy
						}),
					],
					socialProviders: {
						google: {
							clientId: "test",
							clientSecret: "test",
						},
					},
				},
				{
					disableTestUser: true,
				},
			);

			// Step 1: Start OAuth on preview (the non-production environment)
			const res = await preview.client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
				},
			);

			const encryptedState = new URL(res.url!).searchParams.get("state");
			expect(encryptedState).toBeTruthy();

			// Step 2: OAuth callback arrives at production
			// Production can decrypt because it uses the same shared secret
			let encryptedProfile: string | null = null;
			let callbackURL: string | null = null;
			await production.client.$fetch(
				`/callback/google?code=test&state=${encryptedState}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						// Should redirect to preview's oauth-proxy-callback
						expect(location).toContain("preview.example.com");
						expect(location).toContain("/callback/google/oauth-proxy");

						if (location && location.includes("profile=")) {
							const url = new URL(location);
							encryptedProfile = url.searchParams.get("profile");
							callbackURL = url.searchParams.get("callbackURL");
						}
					},
				},
			);

			expect(encryptedProfile).toBeTruthy();

			// Step 3: Preview receives the callback
			// Preview can decrypt the profile because it uses the same shared secret
			await preview.client.$fetch(
				`/oauth-proxy-callback?callbackURL=${encodeURIComponent(callbackURL!)}&profile=${encodeURIComponent(encryptedProfile!)}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						// Should successfully redirect to dashboard
						expect(location).not.toContain("error=");
						expect(location).toContain("/dashboard");
					},
				},
			);

			// Verify user was created on preview
			const previewCtx = await preview.auth.$context;
			const users = await previewCtx.internalAdapter.listUsers();
			expect(users.length).toBe(1);
			expect(users[0]?.email).toBe("user@email.com");

			await preview.client.$fetch(
				`/oauth-proxy-callback?callbackURL=${encodeURIComponent(callbackURL!)}&profile=${encodeURIComponent(encryptedProfile!)}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						expect(location).toContain("error=state_mismatch");
					},
				},
			);
		});
	});

	describe("cookie state strategy", () => {
		it("should validate the state cookie during proxy callback", async () => {
			const proxySecret = "shared-oauth-proxy-secret-for-stateless";
			const preview = await getTestInstance(
				{
					baseURL: "http://preview.example.com",
					database: undefined,
					secret: "preview-main-secret-for-stateless",
					plugins: [
						oAuthProxy({
							productionURL: "http://localhost:3000",
							secret: proxySecret,
						}),
					],
					socialProviders: {
						google: {
							clientId: "test",
							clientSecret: "test",
						},
					},
				},
				{
					disableTestUser: true,
				},
			);
			const production = await getTestInstance(
				{
					baseURL: "http://localhost:3000",
					database: undefined,
					secret: "production-main-secret-for-stateless",
					plugins: [
						oAuthProxy({
							secret: proxySecret,
						}),
					],
					socialProviders: {
						google: {
							clientId: "test",
							clientSecret: "test",
						},
					},
				},
				{
					disableTestUser: true,
				},
			);

			const previewHeaders = new Headers();
			const res = await preview.client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
					onSuccess: preview.cookieSetter(previewHeaders),
				},
			);

			const encryptedState = new URL(res.url!).searchParams.get("state");
			expect(encryptedState).toBeTruthy();

			let encryptedProfile: string | null = null;
			let callbackURL: string | null = null;
			await production.client.$fetch(
				`/callback/google?code=test&state=${encryptedState}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						expect(location).toContain("/callback/google/oauth-proxy");
						if (location) {
							const url = new URL(location);
							encryptedProfile = url.searchParams.get("profile");
							callbackURL = url.searchParams.get("callbackURL");
						}
					},
				},
			);

			expect(encryptedProfile).toBeTruthy();
			expect(callbackURL).toBeTruthy();

			const previewCtx = await preview.auth.$context;

			await preview.client.$fetch(
				`/oauth-proxy-callback?callbackURL=${encodeURIComponent(callbackURL!)}&profile=${encodeURIComponent(encryptedProfile!)}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						expect(location).toContain("error=state_mismatch");
					},
				},
			);
			expect((await previewCtx.internalAdapter.listUsers()).length).toBe(0);

			await preview.client.$fetch(
				`/oauth-proxy-callback?callbackURL=${encodeURIComponent(callbackURL!)}&profile=${encodeURIComponent(encryptedProfile!)}`,
				{
					headers: previewHeaders,
					onError(context) {
						preview.cookieSetter(previewHeaders)(context);
						const location = context.response.headers.get("location");
						expect(location).not.toContain("error=");
						expect(location).toContain("/dashboard");
					},
				},
			);

			const users = await previewCtx.internalAdapter.listUsers();
			expect(users.length).toBe(1);
			expect(users[0]?.email).toBe("user@email.com");
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8889
	 */
	it("should read code from POST body for form_post response mode", async () => {
		const { client } = await getTestInstance({
			database: undefined,
			plugins: [
				oAuthProxy({
					currentURL: "http://preview-localhost:3000",
				}),
			],
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
				},
			},
		});

		const res = await client.signIn.social(
			{
				provider: "google",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
			},
		);

		const encryptedState = new URL(res.url!).searchParams.get("state");
		expect(encryptedState).toBeTruthy();

		// Simulate Apple's form_post: code and state are in the POST body, not the query string
		await client.$fetch(`/callback/google`, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				code: "test",
				state: encryptedState!,
			}).toString(),
			onError(context) {
				const location = context.response.headers.get("location") ?? "";
				expect(location).not.toContain("error=no_code");
				expect(location).not.toContain("error=invalid");
				// Should redirect to proxy callback with profile data
				expect(location).toContain("/callback/google/oauth-proxy");
				expect(location).toContain("profile");
			},
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10598
	 */
	it("should preserve Apple user data from a form_post callback", async () => {
		const appleIdToken = await signJWT(
			{
				sub: "apple-user-id",
				email: "jane@privaterelay.appleid.com",
				email_verified: true,
				is_private_email: true,
				real_user_status: 2,
			},
			DEFAULT_SECRET,
		);
		server.use(
			http.post("https://appleid.apple.com/auth/token", () =>
				HttpResponse.json({
					access_token: "apple-access-token",
					id_token: appleIdToken,
					token_type: "Bearer",
					expires_in: 3600,
				}),
			),
		);

		const { client, auth } = await getTestInstance({
			database: undefined,
			plugins: [
				oAuthProxy({
					currentURL: "http://preview-localhost:3000",
				}),
			],
			socialProviders: {
				apple: {
					clientId: "test-apple-client",
					clientSecret: "test-apple-secret",
				},
			},
		});

		const res = await client.signIn.social(
			{
				provider: "apple",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
			},
		);
		const encryptedState = new URL(res.url!).searchParams.get("state");
		expect(encryptedState).toBeTruthy();

		const userData = JSON.stringify({
			name: {
				firstName: "Jane",
				lastName: "Doe",
			},
			email: "jane@privaterelay.appleid.com",
		});
		let encryptedProfile: string | null = null;

		await client.$fetch("/callback/apple", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				code: "apple-test-code",
				state: encryptedState!,
				id_token: appleIdToken,
				user: userData,
			}).toString(),
			onError(context) {
				const location = context.response.headers.get("location");
				expect(location).toBeTruthy();
				encryptedProfile = new URL(location!).searchParams.get("profile");
			},
		});

		expect(encryptedProfile).toBeTruthy();
		const { secret } = await auth.$context;
		const decrypted = await symmetricDecrypt({
			key: derivePurposeKey(secret, "oauth-proxy-profile"),
			data: encryptedProfile!,
		});
		const payload = parseJSON<{
			userInfo: {
				name: string;
			};
		}>(decrypted);

		expect(payload.userInfo.name).toBe("Jane Doe");
	});
});

describe("oauth-proxy current URL trust", () => {
	it("does not use an untrusted request origin as the proxy callback receiver", async () => {
		const { auth } = await getTestInstance({
			baseURL: "https://myapp.com",
			plugins: [oAuthProxy({ productionURL: "https://login.myapp.com" })],
			socialProviders: {
				google: { clientId: "test", clientSecret: "test" },
			},
		});

		// Sign-in initiated from a request host that is not
		// a trusted origin.
		const signInResponse = await auth.handler(
			new Request("https://untrusted.example/api/auth/sign-in/social", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ provider: "google", callbackURL: "/dashboard" }),
			}),
		);
		const { url } = (await signInResponse.json()) as { url: string };
		const state = new URL(url).searchParams.get("state");

		const callbackResponse = await auth.handler(
			new Request(
				`https://login.myapp.com/api/auth/callback/google?code=test&state=${state}`,
				{ method: "GET" },
			),
		);
		const location = callbackResponse.headers.get("location");
		expect(location).toBeTruthy();
		// Falls back to the configured base URL, never the untrusted request origin.
		expect(location).not.toContain("untrusted.example");
		expect(location).toContain(
			"https://myapp.com/api/auth/callback/google/oauth-proxy",
		);
	});

	it("uses an explicitly trusted request origin as the proxy callback receiver", async () => {
		const { auth } = await getTestInstance({
			baseURL: "https://myapp.com",
			trustedOrigins: ["https://preview.myapp.com"],
			plugins: [oAuthProxy({ productionURL: "https://login.myapp.com" })],
			socialProviders: {
				google: { clientId: "test", clientSecret: "test" },
			},
		});

		const signInResponse = await auth.handler(
			new Request("https://preview.myapp.com/api/auth/sign-in/social", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ provider: "google", callbackURL: "/dashboard" }),
			}),
		);
		const { url } = (await signInResponse.json()) as { url: string };
		const state = new URL(url).searchParams.get("state");

		const callbackResponse = await auth.handler(
			new Request(
				`https://login.myapp.com/api/auth/callback/google?code=test&state=${state}`,
				{ method: "GET" },
			),
		);
		const location = callbackResponse.headers.get("location");
		expect(location).toContain(
			"https://preview.myapp.com/api/auth/callback/google/oauth-proxy",
		);
	});

	it("falls back to the base URL when the platform vendor value is not a URL", async () => {
		// AWS Lambda / GCP / Azure expose a bare function name, not a URL.
		vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "my-lambda-function");
		try {
			const { auth } = await getTestInstance({
				baseURL: "https://myapp.com",
				plugins: [oAuthProxy({ productionURL: "https://login.myapp.com" })],
				socialProviders: {
					google: { clientId: "test", clientSecret: "test" },
				},
			});

			const signInResponse = await auth.handler(
				new Request("https://untrusted.example/api/auth/sign-in/social", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						provider: "google",
						callbackURL: "/dashboard",
					}),
				}),
			);
			const { url } = (await signInResponse.json()) as { url: string };
			const state = new URL(url).searchParams.get("state");

			const callbackResponse = await auth.handler(
				new Request(
					`https://login.myapp.com/api/auth/callback/google?code=test&state=${state}`,
					{ method: "GET" },
				),
			);
			const location = callbackResponse.headers.get("location");
			expect(location).toContain(
				"https://myapp.com/api/auth/callback/google/oauth-proxy",
			);
		} finally {
			vi.unstubAllEnvs();
		}
	});
});
