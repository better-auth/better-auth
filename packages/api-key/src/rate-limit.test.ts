import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateRateLimit } from "./rate-limit";
import type { PredefinedApiKeyOptions } from "./routes";
import type { ApiKey } from "./types";

const opts = {
	rateLimit: { enabled: true },
} as unknown as PredefinedApiKeyOptions;

function baseKey(overrides: Partial<ApiKey>): ApiKey {
	const t = new Date("2025-01-01T00:00:00.000Z");
	return {
		id: "k1",
		configId: "default",
		name: null,
		start: null,
		prefix: null,
		key: "h",
		referenceId: "u1",
		refillInterval: null,
		refillAmount: null,
		lastRefillAt: null,
		enabled: true,
		rateLimitEnabled: true,
		rateLimitTimeWindow: 1000,
		rateLimitMax: 3,
		requestCount: 0,
		rateLimitWindowStart: null,
		remaining: null,
		lastRequest: null,
		expiresAt: null,
		createdAt: t,
		updatedAt: t,
		metadata: null,
		...overrides,
	};
}

describe("evaluateRateLimit (fixed window)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("initializes window on first use", () => {
		const start = new Date("2025-06-01T12:00:00.000Z");
		vi.setSystemTime(start);
		const r = evaluateRateLimit(baseKey({}), opts);
		expect(r).toEqual({ type: "start", now: start });
	});

	it("increments within the same window without moving window start", () => {
		const w0 = new Date("2025-06-01T12:00:00.000Z");
		vi.setSystemTime(new Date("2025-06-01T12:00:00.100Z"));
		const second = evaluateRateLimit(
			baseKey({
				rateLimitWindowStart: w0,
				requestCount: 1,
				lastRequest: w0,
			}),
			opts,
		);
		expect(second).toEqual({
			type: "increment",
			now: new Date("2025-06-01T12:00:00.100Z"),
			max: 3,
			windowStart: w0,
		});
	});

	it("blocks when count reaches max and tryAgainIn reaches window end", () => {
		const w0 = new Date("2025-06-01T12:00:00.000Z");
		vi.setSystemTime(new Date("2025-06-01T12:00:00.500Z"));
		const blocked = evaluateRateLimit(
			baseKey({
				rateLimitWindowStart: w0,
				requestCount: 3,
				lastRequest: new Date("2025-06-01T12:00:00.400Z"),
			}),
			opts,
		);
		expect(blocked.type).toBe("deny");
		if (blocked.type === "deny") {
			expect(blocked.tryAgainIn).toBe(500);
		}
	});

	it("starts a new window when elapsed >= rateLimitTimeWindow (boundary uses >=)", () => {
		const w0 = new Date("2025-06-01T12:00:00.000Z");
		// Exactly one window length later — must roll into a new window (not stay stuck).
		const boundary = new Date("2025-06-01T12:00:01.000Z");
		vi.setSystemTime(boundary);
		const next = evaluateRateLimit(
			baseKey({
				rateLimitWindowStart: w0,
				requestCount: 1,
				lastRequest: w0,
			}),
			opts,
		);
		expect(next).toEqual({
			type: "reset",
			now: boundary,
			windowStart: w0,
		});
	});

	it("allows a new burst at window boundary even if prior window had traffic spread across the interval", () => {
		const w0 = new Date("2025-06-01T12:00:00.000Z");
		const boundary = new Date("2025-06-01T12:01:00.000Z");
		vi.setSystemTime(boundary);
		const third = evaluateRateLimit(
			baseKey({
				rateLimitMax: 2,
				rateLimitTimeWindow: 60_000,
				rateLimitWindowStart: w0,
				requestCount: 2,
				lastRequest: new Date("2025-06-01T12:00:50.000Z"),
			}),
			opts,
		);
		expect(third).toEqual({
			type: "reset",
			now: boundary,
			windowStart: w0,
		});
	});
});
