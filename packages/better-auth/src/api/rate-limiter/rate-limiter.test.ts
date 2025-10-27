import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import type { RateLimit } from "../../types";

describe(
	"rate-limiter",
	{
		timeout: 10000,
	},
	async () => {
		const { client, testUser } = await getTestInstance({
			rateLimit: {
				enabled: true,
				window: 10,
				max: 20,
			},
		});

		it("should return 429 after 3 request for sign-in", async () => {
			for (let i = 0; i < 5; i++) {
				const response = await client.signIn.email({
					email: testUser.email,
					password: testUser.password,
				});
				if (i >= 3) {
					expect(response.error?.status).toBe(429);
				} else {
					expect(response.error).toBeNull();
				}
			}
		});

		it("should reset the limit after the window period", async () => {
			vi.useFakeTimers();
			vi.advanceTimersByTime(11000);
			for (let i = 0; i < 5; i++) {
				const res = await client.signIn.email({
					email: testUser.email,
					password: testUser.password,
				});
				if (i >= 3) {
					expect(res.error?.status).toBe(429);
				} else {
					expect(res.error).toBeNull();
				}
			}
		});

		it("should respond the correct retry-after header", async () => {
			vi.useFakeTimers();
			vi.advanceTimersByTime(3000);
			let retryAfter = "";
			await client.signIn.email(
				{
					email: testUser.email,
					password: testUser.password,
				},
				{
					onError(context) {
						retryAfter = context.response.headers.get("X-Retry-After") ?? "";
					},
				},
			);
			expect(retryAfter).toBe("7");
		});

		it("should rate limit based on the path", async () => {
			const signInRes = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
			});
			expect(signInRes.error?.status).toBe(429);

			const signUpRes = await client.signUp.email({
				email: "new-test@email.com",
				password: testUser.password,
				name: "test",
			});
			expect(signUpRes.error).toBeNull();
		});

		it("non-special-rules limits", async () => {
			for (let i = 0; i < 25; i++) {
				const response = await client.getSession();
				expect(response.error?.status).toBe(i >= 20 ? 429 : undefined);
			}
		});

		it("query params should be ignored", async () => {
			for (let i = 0; i < 25; i++) {
				const response = await client.listSessions({
					fetchOptions: {
						query: {
							"test-query": Math.random().toString(),
						},
					},
				});

				if (i >= 20) {
					expect(response.error?.status).toBe(429);
				} else {
					expect(response.error?.status).toBe(401);
				}
			}
		});
	},
);

describe("custom rate limiting storage", async () => {
	let store = new Map<string, string>();
	const expirationMap = new Map<string, number>();
	const { client, testUser } = await getTestInstance({
		rateLimit: {
			enabled: true,
		},
		secondaryStorage: {
			set(key, value, ttl) {
				store.set(key, value);
				if (ttl) expirationMap.set(key, ttl);
			},
			get(key) {
				return store.get(key) || null;
			},
			delete(key) {
				store.delete(key);
				expirationMap.delete(key);
			},
		},
	});

	it("should use custom storage", async () => {
		await client.getSession();
		expect(store.size).toBe(3);
		let lastRequest = Date.now();
		for (let i = 0; i < 4; i++) {
			const response = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
			});
			const rateLimitData: RateLimit = JSON.parse(
				store.get("127.0.0.1/sign-in/email") ?? "{}",
			);
			expect(rateLimitData.lastRequest).toBeGreaterThanOrEqual(lastRequest);
			lastRequest = rateLimitData.lastRequest;
			if (i >= 3) {
				expect(response.error?.status).toBe(429);
				expect(rateLimitData.count).toBe(3);
			} else {
				expect(response.error).toBeNull();
				expect(rateLimitData.count).toBe(i + 1);
			}
			const rateLimitExp = expirationMap.get("127.0.0.1/sign-in/email");
			expect(rateLimitExp).toBe(10);
		}
	});
});

describe("should work with custom rules", async () => {
	const { client, testUser } = await getTestInstance({
		rateLimit: {
			enabled: true,
			storage: "database",
			customRules: {
				"/sign-in/*": {
					window: 10,
					max: 2,
				},
				"/sign-up/email": {
					window: 10,
					max: 3,
				},
				"/get-session": false,
			},
		},
	});

	it("should use custom rules", async () => {
		for (let i = 0; i < 4; i++) {
			const response = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
			});
			if (i >= 2) {
				expect(response.error?.status).toBe(429);
			} else {
				expect(response.error).toBeNull();
			}
		}

		for (let i = 0; i < 5; i++) {
			const response = await client.signUp.email({
				email: `${Math.random()}@test.com`,
				password: testUser.password,
				name: "test",
			});
			if (i >= 3) {
				expect(response.error?.status).toBe(429);
			} else {
				expect(response.error).toBeNull();
			}
		}
	});

	it("should use default rules if custom rules are not defined", async () => {
		for (let i = 0; i < 5; i++) {
			const response = await client.getSession();
			if (i >= 20) {
				expect(response.error?.status).toBe(429);
			} else {
				expect(response.error).toBeNull();
			}
		}
	});

	it("should not rate limit if custom rule is false", async () => {
		let i = 0;
		let response = null;
		for (; i < 110; i++) {
			response = await client.getSession().then((res) => res.error);
		}
		expect(response).toBeNull();
		expect(i).toBe(110);
	});
});

describe("should work in development/test environment", () => {
	const LOCALHOST_IP = "127.0.0.1";
	const REQUEST_PATH = "/sign-in/email";

	let originalNodeEnv: string | undefined;
	beforeEach(() => {
		originalNodeEnv = process.env.NODE_ENV;
	});
	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv;
		vi.unstubAllEnvs();
	});

	it("should work in development environment", async () => {
		vi.stubEnv("NODE_ENV", "development");

		const store = new Map<string, string>();
		const { client, testUser } = await getTestInstance({
			rateLimit: {
				enabled: true,
				window: 10,
				max: 3,
			},
			secondaryStorage: {
				set(key, value) {
					store.set(key, value);
				},
				get(key) {
					return store.get(key) || null;
				},
				delete(key) {
					store.delete(key);
				},
			},
		});

		for (let i = 0; i < 4; i++) {
			const response = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
			});

			if (i >= 3) {
				expect(response.error?.status).toBe(429);
			} else {
				expect(response.error).toBeNull();
			}
		}

		const signInKeys = Array.from(store.keys()).filter((key) =>
			key.endsWith(REQUEST_PATH),
		);

		expect(signInKeys.length).toBeGreaterThan(0);
		expect(signInKeys[0]).toBe(`${LOCALHOST_IP}${REQUEST_PATH}`);
	});

	it("should work in test environment", async () => {
		vi.stubEnv("NODE_ENV", "test");

		const store = new Map<string, string>();
		const { client, testUser } = await getTestInstance({
			rateLimit: {
				enabled: true,
				window: 10,
				max: 3,
			},
			secondaryStorage: {
				set(key, value) {
					store.set(key, value);
				},
				get(key) {
					return store.get(key) || null;
				},
				delete(key) {
					store.delete(key);
				},
			},
		});

		for (let i = 0; i < 4; i++) {
			const response = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
			});

			if (i >= 3) {
				expect(response.error?.status).toBe(429);
			} else {
				expect(response.error).toBeNull();
			}
		}

		const signInKeys = Array.from(store.keys()).filter((key) =>
			key.endsWith(REQUEST_PATH),
		);

		expect(signInKeys.length).toBeGreaterThan(0);
		expect(signInKeys[0]).toBe(`${LOCALHOST_IP}${REQUEST_PATH}`);
	});
});
