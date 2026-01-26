import { DatabaseSync } from "node:sqlite";
import type { TestContext } from "node:test";
import { test } from "node:test";
import type { GoogleProfile } from "@better-auth/core/social-providers";
import { redisStorage } from "@better-auth/redis-storage";
import { betterAuth } from "better-auth";
import { signJWT } from "better-auth/crypto";
import { getMigrations } from "better-auth/db/migration";
import { Redis } from "ioredis";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";

const DEFAULT_SECRET = "better-auth-secret-123456789";

// Setup MSW server to proxy/mock network requests
const mswServer = setupServer(
	// Mock Google OAuth token endpoint
	http.post("https://oauth2.googleapis.com/token", async () => {
		const data: GoogleProfile = {
			email: "google-user@example.com",
			email_verified: true,
			name: "Google Test User",
			picture: "https://lh3.googleusercontent.com/a-/test",
			exp: 1234567890,
			sub: "google-1234567890",
			iat: 1234567890,
			aud: "test",
			azp: "test",
			nbf: 1234567890,
			iss: "test",
			locale: "en",
			jti: "test",
			given_name: "Google Test",
			family_name: "User",
		};
		const testIdToken = await signJWT(data, DEFAULT_SECRET);
		return HttpResponse.json({
			access_token: "test-access-token",
			refresh_token: "test-refresh-token",
			id_token: testIdToken,
			token_type: "Bearer",
			expires_in: 3600,
		});
	}),
);

test("Redis secondary storage integration", async (t) => {
	const id = crypto.randomUUID();
	const redisClient = new Redis("redis://localhost:6379");

	// Start MSW server before tests
	t.before(() => {
		mswServer.listen({ onUnhandledRequest: "bypass" });
	});

	t.beforeEach(async () => {
		await redisClient.flushall();
	});

	t.after(async () => {
		await redisClient.quit();
		mswServer.close();
	});

	t.afterEach(() => {
		mswServer.resetHandlers();
	});

	await t.test(
		"should store session data in Redis after email signup",
		async (t: TestContext) => {
			const auth = betterAuth({
				database: new DatabaseSync(":memory:"),
				emailAndPassword: {
					enabled: true,
				},
				secondaryStorage: redisStorage({
					client: redisClient,
					keyPrefix: `${id}|`,
				}),
			});

			const { runMigrations } = await getMigrations(auth.options);
			await runMigrations();

			const { token } = await auth.api.signUpEmail({
				body: {
					email: "himself65@outlook.com",
					password: "123456789",
					name: "Alex Yang",
				},
			});

			t.assert.ok(token);

			const storage = auth.options.secondaryStorage;
			const keys = await storage.listKeys();
			// console.log(keys)
			t.assert.equal(keys.length, 2);
			const key = keys.find((key) => !key.startsWith("active-sessions"))!;
			const sessionDataString = await storage.get(key);
			t.assert.ok(sessionDataString);
			const sessionData = JSON.parse(sessionDataString);
			t.assert.ok(sessionData.user.id);
			t.assert.ok(sessionData.session.id);
		},
	);

	await t.test(
		"should store session data in Redis with stateless mode and Google OAuth",
		async (t: TestContext) => {
			const auth = betterAuth({
				// do not set database, as we are using stateless mode
				database: undefined,
				secret: DEFAULT_SECRET,
				session: {
					cookieCache: {
						enabled: true,
						maxAge: 7 * 24 * 60 * 60, // 7 days
						strategy: "jwe",
						refreshCache: true,
					},
				},
				account: {
					storeStateStrategy: "cookie",
					storeAccountCookie: true,
				},
				socialProviders: {
					google: {
						clientId: "demo",
						clientSecret: "demo-secret",
					},
				},
				secondaryStorage: redisStorage({
					client: redisClient,
					keyPrefix: `${id}|`,
				}),
			});

			// Initiate Google OAuth sign-in
			const headers = new Headers();
			const signInRes = await auth.api.signInSocial({
				body: {
					provider: "google",
					callbackURL: "/callback",
				},
				asResponse: true,
			});

			t.assert.ok(signInRes);
			t.assert.equal(signInRes.status, 200);

			const signInData: any = await signInRes.json();
			t.assert.ok(signInData.url);
			t.assert.ok(signInData.url.includes("google.com"));

			const state = new URL(signInData.url).searchParams.get("state");
			t.assert.ok(state);

			const setCookie = signInRes.headers.get("set-cookie");
			if (setCookie) {
				headers.set("cookie", setCookie);
			}

			const callbackReq = new Request(
				`http://localhost:3000/api/auth/callback/google?state=${state}&code=test-authorization-code`,
				{
					method: "GET",
					headers,
				},
			);
			const callbackRes = await auth.handler(callbackReq);

			t.assert.equal(callbackRes.status, 302);
			const location = callbackRes.headers.get("location");
			t.assert.ok(location);
			t.assert.ok(location.includes("/callback"));

			const storage = auth.options.secondaryStorage;
			const keys = await storage.listKeys();
			t.assert.equal(keys.length, 2);

			const sessionKey = keys.find(
				(key) => !key.startsWith("active-sessions"),
			)!;
			const sessionDataString = await storage.get(sessionKey);
			t.assert.ok(sessionDataString);

			const sessionData = JSON.parse(sessionDataString);
			t.assert.ok(sessionData.user.id);
			t.assert.ok(sessionData.session.id);
			t.assert.equal(sessionData.user.email, "google-user@example.com");
		},
	);

	await t.test(
		"should use custom authorization endpoint for Google OAuth provider",
		async (t: TestContext) => {
			const customAuthEndpoint = "http://localhost:8080/custom-oauth/authorize";

			const auth = betterAuth({
				// do not set database, as we are using stateless mode
				database: undefined,
				secret: DEFAULT_SECRET,
				socialProviders: {
					google: {
						clientId: "test-client-id",
						clientSecret: "test-client-secret",
						authorizationEndpoint: customAuthEndpoint,
					},
				},
				secondaryStorage: redisStorage({
					client: redisClient,
					keyPrefix: `${id}|`,
				}),
			});

			const signInRes = await auth.api.signInSocial({
				body: {
					provider: "google",
					callbackURL: "/dashboard",
				},
				asResponse: true,
			});

			t.assert.ok(signInRes);
			t.assert.equal(signInRes.status, 200);

			const signInData: any = await signInRes.json();
			t.assert.ok(signInData.url);
			t.assert.ok(signInData.url.includes(customAuthEndpoint));

			// Verify it uses custom endpoint instead of default google.com
			t.assert.ok(!signInData.url.includes("accounts.google.com"));
			t.assert.ok(signInData.url.includes("localhost:8080"));
		},
	);
});
