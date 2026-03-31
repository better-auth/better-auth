import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isRateLimited } from "./rate-limit";
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

describe("isRateLimited (fixed window)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("initializes window on first use", () => {
		const start = new Date("2025-06-01T12:00:00.000Z");
		vi.setSystemTime(start);
		const r = isRateLimited(baseKey({}), opts);
		expect(r.success).toBe(true);
		expect(r.update).toEqual({
			rateLimitWindowStart: start,
			requestCount: 1,
			lastRequest: start,
		});
	});

	it("increments within the same window without moving window start", () => {
		const w0 = new Date("2025-06-01T12:00:00.000Z");
		vi.setSystemTime(w0);
		const first = isRateLimited(baseKey({}), opts);
		expect(first.success).toBe(true);
		const keyAfterFirst = baseKey({
			rateLimitWindowStart: first.update!.rateLimitWindowStart!,
			requestCount: first.update!.requestCount!,
			lastRequest: first.update!.lastRequest!,
		});

		vi.setSystemTime(new Date("2025-06-01T12:00:00.100Z"));
		const second = isRateLimited(keyAfterFirst, opts);
		expect(second.success).toBe(true);
		expect(second.update?.requestCount).toBe(2);
		expect(second.update?.lastRequest).toEqual(
			new Date("2025-06-01T12:00:00.100Z"),
		);
		expect(second.update?.rateLimitWindowStart).toBeUndefined();
	});

	it("blocks when count reaches max and tryAgainIn reaches window end", () => {
		const w0 = new Date("2025-06-01T12:00:00.000Z");
		vi.setSystemTime(w0);
		let key = baseKey({});
		const a = isRateLimited(key, opts);
		key = { ...key, ...a.update } as ApiKey;
		vi.setSystemTime(new Date("2025-06-01T12:00:00.200Z"));
		const b = isRateLimited(key, opts);
		key = { ...key, ...b.update } as ApiKey;
		vi.setSystemTime(new Date("2025-06-01T12:00:00.400Z"));
		const c = isRateLimited(key, opts);
		key = { ...key, ...c.update } as ApiKey;

		vi.setSystemTime(new Date("2025-06-01T12:00:00.500Z"));
		const blocked = isRateLimited(key, opts);
		expect(blocked.success).toBe(false);
		expect(blocked.tryAgainIn).toBe(500);
	});

	it("starts a new window when elapsed >= rateLimitTimeWindow (boundary uses >=)", () => {
		const w0 = new Date("2025-06-01T12:00:00.000Z");
		vi.setSystemTime(w0);
		let key = baseKey({});
		const a = isRateLimited(key, opts);
		key = { ...key, ...a.update } as ApiKey;

		// Exactly one window length later — must roll into a new window (not stay stuck).
		vi.setSystemTime(new Date("2025-06-01T12:00:01.000Z"));
		const next = isRateLimited(key, opts);
		expect(next.success).toBe(true);
		expect(next.update?.requestCount).toBe(1);
		expect(next.update?.rateLimitWindowStart).toEqual(
			new Date("2025-06-01T12:00:01.000Z"),
		);
	});

	it("allows a new burst at window boundary even if prior window had traffic spread across the interval", () => {
		const w0 = new Date("2025-06-01T12:00:00.000Z");
		vi.setSystemTime(w0);
		let key = baseKey({ rateLimitMax: 2, rateLimitTimeWindow: 60_000 });
		const first = isRateLimited(key, opts);
		key = { ...key, ...first.update } as ApiKey;

		vi.setSystemTime(new Date("2025-06-01T12:00:50.000Z"));
		const second = isRateLimited(key, opts);
		key = { ...key, ...second.update } as ApiKey;

		vi.setSystemTime(new Date("2025-06-01T12:01:00.000Z"));
		const third = isRateLimited(key, opts);
		expect(third.success).toBe(true);
		expect(third.update?.requestCount).toBe(1);
		expect(third.update?.rateLimitWindowStart).toEqual(
			new Date("2025-06-01T12:01:00.000Z"),
		);
	});
});
