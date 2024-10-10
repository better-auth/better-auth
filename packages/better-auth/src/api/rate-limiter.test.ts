import { describe, it, expect, vi } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";

describe("rate-limiter", async () => {
	const { client, testUser } = await getTestInstance({
		rateLimit: {
			window: 10,
			max: 20,
		},
	});

	it("should return 429 after 7 request for sign-in", async () => {
		for (let i = 0; i < 10; i++) {
			const response = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
			});
			if (i >= 7) {
				expect(response.error?.status).toBe(429);
			} else {
				expect(response.error).toBeNull();
			}
		}
	});

	it("should reset the limit after the window period", async () => {
		vi.useFakeTimers();
		vi.advanceTimersByTime(11000);
		for (let i = 0; i < 10; i++) {
			const res = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
			});
			if (i >= 7) {
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
			const response = await client.session();
			expect(response.error?.status).toBe(i >= 20 ? 429 : 401);
		}
	});
});

describe("custom rate limiting storage", async () => {
	let store = new Map<string, string>();
	const { client, testUser } = await getTestInstance({
		secondaryStorage: {
			set(key, value, ttl) {
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

	it("should use custom storage", async () => {
		await client.session();
		expect(store.size).toBe(2);
		for (let i = 0; i < 10; i++) {
			const response = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
			});
			if (i >= 7) {
				expect(response.error?.status).toBe(429);
			} else {
				expect(response.error).toBeNull();
			}
		}
	});
});
