import { describe, it, beforeAll, expect, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { rateLimiter } from ".";

describe("rate-limiter", async () => {
	const { client, testUser } = await getTestInstance({
		plugins: [
			rateLimiter({
				enabled: true,
				storage: {
					provider: "memory",
				},
				max: 10,
				window: 10,
				specialRules: [],
			}),
		],
	});

	it.only("should allow requests within the limit", async () => {
		for (let i = 0; i < 10; i++) {
			const response = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
			});

			if (i === 9) {
				expect(response.error?.status).toBe(429);
			} else {
				expect(response.error).toBeNull();
			}
		}
	});

	it.only("should reset the limit after the window period", async () => {
		vi.useFakeTimers();

		// Make 10 requests to hit the limit
		for (let i = 0; i < 10; i++) {
			const res = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
			});
			if (res.error?.status === 429) {
				break;
			}
		}
		// Advance the timer by 11 seconds (just over the 10-second window)
		vi.advanceTimersByTime(11000);
		const response = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
		});
		expect(response.error).toBeNull();
		vi.useRealTimers();
	});
});
