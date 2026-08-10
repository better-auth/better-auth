import { describe, expect, it } from "vitest";
import { evaluateRateLimit } from "./rate-limit";
import type { ApiKey } from "./types";

const options = {
	rateLimit: { enabled: true },
};
const policy = {
	maxRequests: 5,
	windowMs: 2_000,
};

function createApiKey(overrides: Partial<ApiKey> = {}): ApiKey {
	const createdAt = new Date("2026-01-01T00:00:00.000Z");
	return {
		id: "api-key-id",
		configId: "default",
		name: null,
		start: null,
		prefix: null,
		key: "hashed-key",
		referenceId: "user-id",
		refillInterval: null,
		refillAmount: null,
		lastRefillAt: null,
		enabled: true,
		rateLimitEnabled: true,
		rateLimitTimeWindow: policy.windowMs,
		rateLimitMax: policy.maxRequests,
		requestCount: policy.maxRequests,
		remaining: null,
		lastRequest: new Date("2026-01-01T00:00:01.800Z"),
		rateLimitResetAt: new Date("2026-01-01T00:00:02.000Z"),
		expiresAt: null,
		createdAt,
		updatedAt: createdAt,
		metadata: null,
		permissions: null,
		...overrides,
	};
}

describe("evaluateRateLimit", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/6035
	 */
	it("opens a new fixed window after the deadline despite continuous traffic", () => {
		const now = new Date("2026-01-01T00:00:02.400Z");
		const observedResetAt = new Date("2026-01-01T00:00:02.000Z");

		const decision = evaluateRateLimit(createApiKey(), options, now);

		expect(decision).toEqual({
			type: "open",
			now,
			observedResetAt,
			resetAt: new Date("2026-01-01T00:00:04.400Z"),
			policy,
		});
	});

	it("opens the first window when no deadline exists", () => {
		const now = new Date("2026-01-01T00:00:00.000Z");

		const decision = evaluateRateLimit(
			createApiKey({ rateLimitResetAt: null, requestCount: 0 }),
			options,
			now,
		);

		expect(decision).toEqual({
			type: "open",
			now,
			observedResetAt: null,
			resetAt: new Date("2026-01-01T00:00:02.000Z"),
			policy,
		});
	});

	it("treats the reset deadline as the exclusive end of the window", () => {
		const now = new Date("2026-01-01T00:00:02.000Z");
		const observedResetAt = new Date("2026-01-01T00:00:02.000Z");

		const decision = evaluateRateLimit(createApiKey(), options, now);

		expect(decision).toEqual({
			type: "open",
			now,
			observedResetAt,
			resetAt: new Date("2026-01-01T00:00:04.000Z"),
			policy,
		});
	});

	it("increments within a window without moving its deadline", () => {
		const now = new Date("2026-01-01T00:00:01.900Z");
		const resetAt = new Date("2026-01-01T00:00:02.000Z");

		const decision = evaluateRateLimit(
			createApiKey({ requestCount: 4 }),
			options,
			now,
		);

		expect(decision).toEqual({
			type: "increment",
			now,
			resetAt,
			policy,
		});
	});

	it("reports retry time from the stable window deadline", () => {
		const now = new Date("2026-01-01T00:00:01.500Z");

		const decision = evaluateRateLimit(
			createApiKey({
				lastRequest: new Date("2026-01-01T00:00:01.400Z"),
			}),
			options,
			now,
		);

		expect(decision).toMatchObject({
			type: "deny",
			tryAgainIn: 500,
		});
	});

	it("stamps the accepted request without consuming a slot when disabled", () => {
		const now = new Date("2026-01-01T00:00:01.500Z");

		expect(
			evaluateRateLimit(createApiKey(), { rateLimit: { enabled: false } }, now),
		).toEqual({ type: "skip", lastRequest: now });
		expect(
			evaluateRateLimit(
				createApiKey({ rateLimitEnabled: false }),
				options,
				now,
			),
		).toEqual({ type: "skip", lastRequest: now });
	});

	it("leaves the request timestamp untouched when the key has no policy", () => {
		const now = new Date("2026-01-01T00:00:01.500Z");

		const decision = evaluateRateLimit(
			createApiKey({ rateLimitMax: null }),
			options,
			now,
		);

		expect(decision).toEqual({ type: "skip", lastRequest: null });
	});
});
