import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db";
import { createAuthMiddleware, oAuthProxy } from "better-auth/plugins";
import { createAuthClient } from "better-auth/react";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { expo } from "../src";
import { expoClient, storageAdapter } from "../src/client";

vi.mock("expo-web-browser", async () => {
	return {
		openAuthSessionAsync: vi.fn(async (...args) => {
			fn(...args);
			return {
				type: "success",
				url: "better-auth://?cookie=better-auth.session_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjYxMzQwZj",
			};
		}),
	};
});

vi.mock("react-native", async () => {
	return {
		AppState: {
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		},
		Platform: {
			OS: "android",
		},
	};
});

vi.mock("expo-constants", async () => {
	return {
		default: {
			platform: {
				scheme: "better-auth",
			},
		},
	};
});

vi.mock("expo-linking", async () => {
	return {
		createURL: vi.fn((url) => `better-auth://${url}`),
	};
});

const fn = vi.fn();

function testUtils(extraOpts?: Parameters<typeof betterAuth>[0]) {
	const storage = new Map<string, string>();

	const auth = betterAuth({
		baseURL: "http://localhost:3000",
		database: new Database(":memory:"),
		emailAndPassword: {
			enabled: true,
		},
		socialProviders: {
			google: {
				clientId: "test",
				clientSecret: "test",
			},
		},
		plugins: [expo(), oAuthProxy()],
		trustedOrigins: ["better-auth://"],
		...extraOpts,
	});

	const client = createAuthClient({
		baseURL: "http://localhost:3000",
		fetchOptions: {
			customFetchImpl: (url, init) => {
				const req = new Request(url.toString(), init);
				return auth.handler(req);
			},
		},
		plugins: [
			expoClient({
				storage: {
					getItem: (key) => storage.get(key) || null,
					setItem: async (key, value) => storage.set(key, value),
				},
			}),
		],
	});

	return { storage, auth, client };
}

describe("expo", async () => {
	const { auth, client, storage } = testUtils();

	beforeAll(async () => {
		const { runMigrations } = await getMigrations(auth.options);
		await runMigrations();
		vi.useFakeTimers();
	});
	afterAll(() => {
		vi.useRealTimers();
	});

	it("should store cookie with expires date", async () => {
		const testUser = {
			email: "test@test.com",
			password: "password",
			name: "Test User",
		};
		await client.signUp.email(testUser);
		const storedCookie = storage.get("better-auth_cookie");
		expect(storedCookie).toBeDefined();
		const parsedCookie = JSON.parse(storedCookie || "");
		expect(parsedCookie["better-auth.session_token"]).toMatchObject({
			value: expect.stringMatching(/.+/),
			expires: expect.any(String),
		});
	});

	it("should send cookie and get session", async () => {
		const { data } = await client.getSession();
		expect(data).toMatchObject({
			session: expect.any(Object),
			user: expect.any(Object),
		});
	});

	it("should use the scheme to open the browser", async () => {
		const { data: res } = await client.signIn.social({
			provider: "google",
			callbackURL: "/dashboard",
		});
		const stateId = res?.url?.split("state=")[1]!.split("&")[0];
		const ctx = await auth.$context;
		if (!stateId) {
			throw new Error("State ID not found");
		}
		const state = await ctx.internalAdapter.findVerificationValue(stateId);
		const callbackURL = JSON.parse(state?.value || "{}").callbackURL;
		expect(callbackURL).toBe("better-auth:///dashboard");
		expect(res).toMatchObject({
			url: expect.stringContaining("accounts.google"),
		});
		expect(fn).toHaveBeenCalledWith(
			expect.stringContaining("accounts.google"),
			"better-auth:///dashboard",
		);
	});

	it("should get cookies", async () => {
		const c = client.getCookie();
		expect(c).includes("better-auth.session_token");
	});
	it("should correctly parse multiple Set-Cookie headers with Expires commas", async () => {
		const header =
			"better-auth.session_token=abc; Expires=Wed, 21 Oct 2015 07:28:00 GMT; Path=/, better-auth.session_data=xyz; Expires=Thu, 22 Oct 2015 07:28:00 GMT; Path=/";
		const map = (await import("../src/client")).parseSetCookieHeader(header);
		expect(map.get("better-auth.session_token")?.value).toBe("abc");
		expect(map.get("better-auth.session_data")?.value).toBe("xyz");
	});

	it("should not trigger infinite refetch with non-better-auth cookies", async () => {
		const { hasBetterAuthCookies } = await import("../src/client");

		const betterAuthOnlyHeader = "better-auth.session_token=abc; Path=/";
		expect(hasBetterAuthCookies(betterAuthOnlyHeader, "better-auth")).toBe(
			true,
		);

		const sessionDataHeader = "better-auth.session_data=xyz; Path=/";
		expect(hasBetterAuthCookies(sessionDataHeader, "better-auth")).toBe(true);

		const secureBetterAuthHeader =
			"__Secure-better-auth.session_token=abc; Path=/";
		expect(hasBetterAuthCookies(secureBetterAuthHeader, "better-auth")).toBe(
			true,
		);

		const secureSessionDataHeader =
			"__Secure-better-auth.session_data=xyz; Path=/";
		expect(hasBetterAuthCookies(secureSessionDataHeader, "better-auth")).toBe(
			true,
		);

		const nonBetterAuthHeader = "__cf_bm=abc123; Path=/; HttpOnly; Secure";
		expect(hasBetterAuthCookies(nonBetterAuthHeader, "better-auth")).toBe(
			false,
		);

		const mixedHeader =
			"__cf_bm=abc123; Path=/; HttpOnly; Secure, better-auth.session_token=xyz; Path=/";
		expect(hasBetterAuthCookies(mixedHeader, "better-auth")).toBe(true);

		const customPrefixHeader = "my-app.session_token=abc; Path=/";
		expect(hasBetterAuthCookies(customPrefixHeader, "my-app")).toBe(true);
		expect(hasBetterAuthCookies(customPrefixHeader, "better-auth")).toBe(false);

		const customPrefixDataHeader = "my-app.session_data=abc; Path=/";
		expect(hasBetterAuthCookies(customPrefixDataHeader, "my-app")).toBe(true);

		const emptyPrefixHeader = "session_token=abc; Path=/";
		expect(hasBetterAuthCookies(emptyPrefixHeader, "")).toBe(true);

		const customFullNameHeader = "my_custom_session_token=abc; Path=/";
		expect(hasBetterAuthCookies(customFullNameHeader, "")).toBe(true);

		const customFullDataHeader = "my_custom_session_data=xyz; Path=/";
		expect(hasBetterAuthCookies(customFullDataHeader, "")).toBe(true);

		const multipleNonBetterAuthHeader =
			"__cf_bm=abc123; Path=/, _ga=GA1.2.123456789.1234567890; Path=/";
		expect(
			hasBetterAuthCookies(multipleNonBetterAuthHeader, "better-auth"),
		).toBe(false);

		// Non-session better-auth cookies should still be detected (e.g., passkey cookies)
		const nonSessionBetterAuthHeader = "better-auth.other_cookie=abc; Path=/";
		expect(
			hasBetterAuthCookies(nonSessionBetterAuthHeader, "better-auth"),
		).toBe(true);

		// Passkey cookie should be detected
		const passkeyHeader = "better-auth-passkey=xyz; Path=/";
		expect(hasBetterAuthCookies(passkeyHeader, "better-auth")).toBe(true);

		// Secure passkey cookie should be detected
		const securePasskeyHeader = "__Secure-better-auth-passkey=xyz; Path=/";
		expect(hasBetterAuthCookies(securePasskeyHeader, "better-auth")).toBe(true);

		// Custom passkey cookie name should be detected
		const customPasskeyHeader = "better-auth-custom-challenge=xyz; Path=/";
		expect(hasBetterAuthCookies(customPasskeyHeader, "better-auth")).toBe(true);
	});

	it("should preserve unchanged client store session properties on signout", async () => {
		const before = client.$store.atoms.session!.get();
		await client.signOut();
		const after = client.$store.atoms.session!.get();

		expect(after).toMatchObject({
			...before,
			data: null,
			error: null,
			isPending: false,
		});
	});

	it("should modify origin header to expo origin if origin is not set", async () => {
		let originalOrigin = null;
		let origin = null;
		const { auth, client } = testUtils({
			hooks: {
				before: createAuthMiddleware(async (ctx) => {
					origin = ctx.request?.headers.get("origin");
				}),
			},
			plugins: [
				{
					id: "test",
					async onRequest(request, ctx) {
						const origin = request.headers.get("origin");
						originalOrigin = origin;
					},
				},
				expo(),
			],
		});
		const { runMigrations } = await getMigrations(auth.options);
		await runMigrations();
		await client.signIn.email({
			email: "test@test.com",
			password: "password",
			callbackURL: "http://localhost:3000/callback",
		});
		expect(origin).toBe("better-auth://");
		expect(originalOrigin).toBeNull();
	});

	it("should not modify origin header if origin is set", async () => {
		let originalOrigin = "test.com";
		let origin = null;
		const { auth, client } = testUtils({
			hooks: {
				before: createAuthMiddleware(async (ctx) => {
					origin = ctx.request?.headers.get("origin");
				}),
			},
			plugins: [expo()],
		});
		const { runMigrations } = await getMigrations(auth.options);
		await runMigrations();
		await client.signIn.email(
			{
				email: "test@test.com",
				password: "password",
				callbackURL: "http://localhost:3000/callback",
			},
			{
				headers: {
					origin: originalOrigin,
				},
			},
		);
		expect(origin).toBe(originalOrigin);
	});

	it("should not modify origin header if disableOriginOverride is set", async () => {
		let origin = null;
		const { auth, client } = testUtils({
			plugins: [expo({ disableOriginOverride: true })],
			hooks: {
				before: createAuthMiddleware(async (ctx) => {
					origin = ctx.request?.headers.get("origin");
				}),
			},
		});
		const { runMigrations } = await getMigrations(auth.options);
		await runMigrations();
		await client.signIn.email({
			email: "test@test.com",
			password: "password",
			callbackURL: "http://localhost:3000/callback",
		});
		expect(origin).toBe(null);
	});

	it("should preserve existing cookies on link-social", async () => {
		await client.signIn.email({
			email: "test@test.com",
			password: "password",
		});
		const testCookie = "better-auth.test-key";
		const testCookieValue = "abc";

		const storedCookieBefore = storage.get("better-auth_cookie");
		expect(storedCookieBefore).toBeDefined();
		const parsedCookieBefore = JSON.parse(storedCookieBefore || "");
		expect(parsedCookieBefore[testCookie]).toBeUndefined();

		const expoWebBrowser = await import("expo-web-browser");
		vi.mocked(expoWebBrowser.openAuthSessionAsync).mockResolvedValueOnce({
			type: "success",
			url: `better-auth://?cookie=${testCookie}=${testCookieValue}`,
		});

		await client.linkSocial({ provider: "google" });

		const storedCookieAfter = storage.get("better-auth_cookie");
		expect(storedCookieAfter).toBeDefined();
		const parsedCookieAfter = JSON.parse(storedCookieAfter || "");
		expect(parsedCookieAfter[testCookie]?.value).toBe(testCookieValue);
		Object.keys(parsedCookieBefore).forEach((key) => {
			expect(
				parsedCookieAfter[key]?.value,
				`cookie "${key}" value is preserved`,
			).toBe(parsedCookieBefore[key]?.value);
		});
	});
});

describe("expo with cookieCache", async () => {
	const { auth, client, storage } = testUtils({
		session: {
			expiresIn: 5,
			cookieCache: {
				enabled: true,
				maxAge: 1,
			},
		},
	});
	beforeAll(async () => {
		const { runMigrations } = await getMigrations(auth.options);
		await runMigrations();
		vi.useFakeTimers();
	});
	afterAll(() => {
		vi.useRealTimers();
	});

	it("should store cookie with expires date", async () => {
		const testUser = {
			email: "test@test.com",
			password: "password",
			name: "Test User",
		};
		await client.signUp.email(testUser);
		const storedCookie = storage.get("better-auth_cookie");
		expect(storedCookie).toBeDefined();
		const parsedCookie = JSON.parse(storedCookie || "");
		expect(parsedCookie["better-auth.session_token"]).toMatchObject({
			value: expect.stringMatching(/.+/),
			expires: expect.any(String),
		});
		expect(parsedCookie["better-auth.session_data"]).toMatchObject({
			value: expect.stringMatching(/.+/),
			expires: expect.any(String),
		});
	});
	it("should refresh session_data when it expired without erasing session_token", async () => {
		vi.advanceTimersByTime(1000);
		const { data } = await client.getSession();
		expect(data).toMatchObject({
			session: expect.any(Object),
			user: expect.any(Object),
		});
		const storedCookie = storage.get("better-auth_cookie");
		expect(storedCookie).toBeDefined();
		const parsedCookie = JSON.parse(storedCookie || "");
		expect(parsedCookie["better-auth.session_token"]).toMatchObject({
			value: expect.any(String),
			expires: expect.any(String),
		});
		expect(parsedCookie["better-auth.session_data"]).toMatchObject({
			value: expect.any(String),
			expires: expect.any(String),
		});
	});

	it("should erase both session_data and session_token when token expired", async () => {
		vi.advanceTimersByTime(5000);
		const { data } = await client.getSession();
		expect(data).toBeNull();
		const storedCookie = storage.get("better-auth_cookie");
		expect(storedCookie).toBeDefined();
		const parsedCookie = JSON.parse(storedCookie || "");
		expect(parsedCookie["better-auth.session_token"]).toMatchObject({
			value: expect.any(String),
			expires: expect.any(String),
		});
		expect(parsedCookie["better-auth.session_data"]).toMatchObject({
			value: expect.any(String),
			expires: expect.any(String),
		});
	});

	it("should add `exp://` to trusted origins", async () => {
		vi.stubEnv("NODE_ENV", "development");
		const auth = betterAuth({
			plugins: [expo()],
			trustedOrigins: ["http://localhost:3000"],
		});
		const ctx = await auth.$context;
		expect(ctx.options.trustedOrigins).toContain("exp://");
		expect(ctx.options.trustedOrigins).toContain("http://localhost:3000");
	});

	it("should allow independent cookiePrefix configuration", async () => {
		const { hasBetterAuthCookies } = await import("../src/client");

		const customCookieHeader = "my-app.session_token=abc; Path=/";

		expect(hasBetterAuthCookies(customCookieHeader, "my-app")).toBe(true);

		expect(hasBetterAuthCookies(customCookieHeader, "better-auth")).toBe(false);
	});

	it("should support array of cookie prefixes", async () => {
		const { hasBetterAuthCookies } = await import("../src/client");

		// Test with multiple prefixes - should match any of them
		const betterAuthHeader = "better-auth.session_token=abc; Path=/";
		expect(
			hasBetterAuthCookies(betterAuthHeader, ["better-auth", "my-app"]),
		).toBe(true);

		const myAppHeader = "my-app.session_data=xyz; Path=/";
		expect(hasBetterAuthCookies(myAppHeader, ["better-auth", "my-app"])).toBe(
			true,
		);

		const otherAppHeader = "other-app.session_token=def; Path=/";
		expect(
			hasBetterAuthCookies(otherAppHeader, ["better-auth", "my-app"]),
		).toBe(false);

		// Test with passkey cookies
		const passkeyHeader1 = "better-auth-passkey=xyz; Path=/";
		expect(
			hasBetterAuthCookies(passkeyHeader1, ["better-auth", "my-app"]),
		).toBe(true);

		const passkeyHeader2 = "my-app-passkey=xyz; Path=/";
		expect(
			hasBetterAuthCookies(passkeyHeader2, ["better-auth", "my-app"]),
		).toBe(true);

		// Test with __Secure- prefix
		const secureHeader = "__Secure-my-app.session_token=abc; Path=/";
		expect(hasBetterAuthCookies(secureHeader, ["better-auth", "my-app"])).toBe(
			true,
		);

		// Test with empty array (should check for suffixes)
		const sessionTokenHeader = "session_token=abc; Path=/";
		expect(hasBetterAuthCookies(sessionTokenHeader, [])).toBe(false);
		expect(hasBetterAuthCookies(sessionTokenHeader, [""])).toBe(true);
	});

	it("should normalize colons in secure storage name via storage adapter", async () => {
		const map = new Map<string, string>();
		const storage = storageAdapter({
			getItem(name) {
				return map.get(name) || null;
			},
			setItem(name, value) {
				map.set(name, value);
			},
		});
		storage.setItem("better-auth:session_token", "123");
		expect(map.has("better-auth_session_token")).toBe(true);
		expect(map.has("better-auth:session_token")).toBe(false);
	});
});
