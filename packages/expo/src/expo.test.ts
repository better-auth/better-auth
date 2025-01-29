import { createAuthClient } from "better-auth/client";
import Database from "better-sqlite3";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { expo } from ".";
import { expoClient } from "./client";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db";

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
		plugins: [expo()],
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
			value: expect.stringMatching(/.+/),
			expires: expect.any(String),
		});
		expect(parsedCookie["better-auth.session_data"]).toMatchObject({
			value: expect.stringMatching(/.+/),
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
			value: expect.stringMatching(/^$/),
			expires: expect.any(String),
		});
		expect(parsedCookie["better-auth.session_data"]).toMatchObject({
			value: expect.stringMatching(/^$/),
			expires: expect.any(String),
		});
	});
});
